// Offline sanity check: build create_room + join_room instructions from the
// vendored IDL exactly the way src/lib/chain/rooms.ts does. No RPC, no funds.
import { BN, Program, utils } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, Connection } from "@solana/web3.js";
import { readFileSync } from "node:fs";

const idl = JSON.parse(readFileSync(new URL("../src/lib/chain/eleven.idl.json", import.meta.url), "utf8"));
const programId = new PublicKey(idl.address);
const program = new Program(idl, { connection: new Connection("http://127.0.0.1:1") });

const creator = Keypair.generate().publicKey;
const roomId = new BN(1752260000000);
const room = PublicKey.findProgramAddressSync(
  [utils.bytes.utf8.encode("room"), creator.toBuffer(), roomId.toArrayLike(Buffer, "le", 8)],
  programId,
)[0];
const part = (owner) =>
  PublicKey.findProgramAddressSync(
    [utils.bytes.utf8.encode("participant"), room.toBuffer(), owner.toBuffer()],
    programId,
  )[0];

const kickoff = 1752260000;
const end = kickoff + 3 * 3600;
const market = (statKey, threshold) => ({
  statKey,
  period: 0,
  threshold: new BN(threshold),
  comparison: 0,
  hasSecond: false,
  statKey2: 0,
  period2: 0,
  op: 0,
  lockTs: new BN(kickoff),
  resolveDeadlineTs: new BN(end),
  yesPoints: 100,
  noPoints: 100,
  isLive: false,
});

const createIx = await program.methods
  .createRoom({
    roomId,
    fixtureId: 900101,
    buyInLamports: new BN(50_000_000),
    rakeBps: 500,
    maxPlayers: 8,
    joinDeadlineTs: new BN(kickoff),
    kickoffTs: new BN(kickoff),
    endTs: new BN(end),
    refundDeadlineTs: new BN(end + 3600),
    treasury: Keypair.generate().publicKey,
    markets: [market(1, 2), market(6, 6), market(8, 0)],
  })
  .accounts({ creator, room, participant: part(creator), systemProgram: SystemProgram.programId })
  .instruction();
console.log("create_room ix ok:", createIx.keys.length, "accounts,", createIx.data.length, "bytes");

const joiner = Keypair.generate().publicKey;
const joinIx = await program.methods
  .joinRoom()
  .accounts({ joiner, room, participant: part(joiner), systemProgram: SystemProgram.programId })
  .instruction();
console.log("join_room ix ok:", joinIx.keys.length, "accounts,", joinIx.data.length, "bytes");

// The joiner must be a signer and the room writable — the escrow transfer depends on it.
const joinerMeta = joinIx.keys.find((k) => k.pubkey.equals(joiner));
const roomMeta = joinIx.keys.find((k) => k.pubkey.equals(room));
if (!joinerMeta?.isSigner || !joinerMeta?.isWritable) throw new Error("joiner meta wrong");
if (!roomMeta?.isWritable) throw new Error("room meta wrong");
console.log("account metas ok (joiner signs+pays, room escrow writable)");
