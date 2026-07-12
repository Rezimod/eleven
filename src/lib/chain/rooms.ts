import { BN, Program, utils, type Idl, type Provider } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Transaction, type TransactionInstruction } from "@solana/web3.js";
import { Buffer } from "buffer";

import { marketPoints } from "@/lib/eleven";
import idl from "./eleven.idl.json";
import { ELEVEN_PROGRAM_ID, TREASURY, getConnection } from "./config";

/**
 * On-chain room client — discovery + the two escrow-moving entry transactions
 * (`create_room`, `join_room`). Room entry is PAID ONLY: both instructions
 * transfer the buy-in from the signer into the room escrow PDA; there is no
 * free path. Escrow leaves only via proof-verified `settle_room` or `refund`
 * (enforced by the program — see anchor/programs/eleven).
 */

const RAKE_BPS = 500; // 5%, capped at 10% on-chain
const MATCH_SECONDS = 3 * 60 * 60; // room end: kickoff + 3h covers 90' + stoppage
const CORNERS_LINE = 6;
const GOALS_LINE = 2;

/** Joins stay open through LIVE until ~80' — mirrors LIVE_JOIN_CUTOFF_SECS on-chain. */
export const LIVE_JOIN_CUTOFF_SECS = 80 * 60;

/** The moment joining a room for this kickoff closes (unix seconds). */
export function joinCutoffSec(kickoffSec: number, endSec?: number): number {
  const cutoff = kickoffSec + LIVE_JOIN_CUTOFF_SECS;
  return endSec === undefined ? cutoff : Math.min(cutoff, endSec);
}

// Room account layout: 8 discriminator + 32 authority + 32 treasury + 8 room_id.
const FIXTURE_ID_OFFSET = 80;

export interface RoomAccount {
  authority: PublicKey;
  treasury: PublicKey;
  roomId: BN;
  fixtureId: number;
  buyInLamports: BN;
  rakeBps: number;
  maxPlayers: number;
  playerCount: number;
  joinDeadlineTs: BN;
  kickoffTs: BN;
  endTs: BN;
  potLamports: BN;
  phase: Record<string, object>;
  settled: boolean;
}

export interface OpenRoom {
  pubkey: PublicKey;
  account: RoomAccount;
}

function program(): Program {
  // Read-only provider: instruction building + account fetches never sign.
  const provider = { connection: getConnection() } as Provider;
  return new Program(idl as Idl, provider);
}

export function participantPda(room: PublicKey, owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [utils.bytes.utf8.encode("participant"), room.toBuffer(), owner.toBuffer()],
    ELEVEN_PROGRAM_ID,
  )[0];
}

export function roomPda(authority: PublicKey, roomId: BN): PublicKey {
  return PublicKey.findProgramAddressSync(
    [utils.bytes.utf8.encode("room"), authority.toBuffer(), roomId.toArrayLike(Buffer, "le", 8)],
    ELEVEN_PROGRAM_ID,
  )[0];
}

/** Untyped-IDL escape hatch: the generic Program type doesn't know account names. */
interface RoomNamespace {
  room: { all(filters: unknown[]): Promise<Array<{ publicKey: PublicKey; account: unknown }>> };
}

/** Every on-chain room for a fixture (devnet `getProgramAccounts` + memcmp). */
export async function fetchRoomsForFixture(fixtureId: number): Promise<OpenRoom[]> {
  const fixtureBytes = Buffer.alloc(4);
  fixtureBytes.writeUInt32LE(fixtureId);
  const rooms = await (program().account as unknown as RoomNamespace).room.all([
    { memcmp: { offset: FIXTURE_ID_OFFSET, bytes: utils.bytes.bs58.encode(fixtureBytes) } },
  ]);
  return rooms.map((r) => ({ pubkey: r.publicKey, account: r.account as RoomAccount }));
}

export function isJoinable(r: RoomAccount, buyInLamports: number, nowSec: number): boolean {
  // Stored phase only moves when the advance_phase crank runs, so accept
  // Lobby or Live and gate on the clock like the program does: joins are open
  // from creation through LIVE until min(kickoff + 80', full time).
  return (
    ("lobby" in r.phase || "live" in r.phase) &&
    !r.settled &&
    r.buyInLamports.eq(new BN(buyInLamports)) &&
    r.playerCount < r.maxPlayers &&
    nowSec < joinCutoffSec(r.kickoffTs.toNumber(), r.endTs.toNumber())
  );
}

/** The room (if any) this owner has already paid into, from participant PDAs. */
export async function findJoinedRoom(rooms: OpenRoom[], owner: PublicKey): Promise<OpenRoom | null> {
  if (rooms.length === 0) return null;
  const pdas = rooms.map((r) => participantPda(r.pubkey, owner));
  const infos = await getConnection().getMultipleAccountsInfo(pdas);
  const i = infos.findIndex((info) => info !== null);
  return i === -1 ? null : rooms[i];
}

/**
 * The three provable pre-match markets every client-created room commits.
 * Monotone `validate_stat` predicates only (goals / corners / red cards) —
 * exactly the shapes the settlement keeper resolves via ProveYes / TimeoutNo.
 * Pre-match markets MUST lock exactly at kickoff (enforced on-chain).
 */
function preMatchMarketInits(kickoffTs: number, endTs: number) {
  const init = (statKey: number, threshold: number, yesProb: number) => {
    const { yesPoints, noPoints } = marketPoints(yesProb);
    return {
      statKey,
      period: 0,
      threshold: new BN(threshold),
      comparison: 0, // GreaterThan
      hasSecond: false,
      statKey2: 0,
      period2: 0,
      op: 0,
      lockTs: new BN(kickoffTs),
      resolveDeadlineTs: new BN(endTs),
      yesPoints,
      noPoints,
      isLive: false,
    };
  };
  return [
    init(1, GOALS_LINE, 0.52), // total goals over 2
    init(6, CORNERS_LINE, 0.52), // total corners over 6
    init(8, 0, 0.24), // a red card is shown
  ];
}

export interface EntryTx {
  tx: Transaction;
  room: PublicKey;
  kind: "create" | "join";
}

/** `join_room` — pays the room's fixed buy-in into its escrow PDA. */
export async function buildJoinTx(room: OpenRoom, joiner: PublicKey): Promise<EntryTx> {
  const ix: TransactionInstruction = await program()
    .methods.joinRoom()
    .accounts({
      joiner,
      room: room.pubkey,
      participant: participantPda(room.pubkey, joiner),
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  return { tx: new Transaction().add(ix), room: room.pubkey, kind: "join" };
}

/**
 * `create_room` — opens a fresh fixed-buy-in room for a fixture; the creator
 * is player #1 and pays the same buy-in into escrow in the same transaction.
 */
export async function buildCreateTx(
  fixtureId: number,
  buyInLamports: number,
  kickoffTsSec: number,
  creator: PublicKey,
): Promise<EntryTx> {
  const roomId = new BN(Date.now());
  const room = roomPda(creator, roomId);
  const endTs = kickoffTsSec + MATCH_SECONDS;
  const args = {
    roomId,
    fixtureId,
    buyInLamports: new BN(buyInLamports),
    rakeBps: RAKE_BPS,
    maxPlayers: 8,
    joinDeadlineTs: new BN(kickoffTsSec),
    kickoffTs: new BN(kickoffTsSec),
    endTs: new BN(endTs),
    refundDeadlineTs: new BN(endTs + 3600),
    treasury: TREASURY,
    markets: preMatchMarketInits(kickoffTsSec, endTs),
  };
  const ix: TransactionInstruction = await program()
    .methods.createRoom(args)
    .accounts({
      creator,
      room,
      participant: participantPda(room, creator),
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  return { tx: new Transaction().add(ix), room, kind: "create" };
}
