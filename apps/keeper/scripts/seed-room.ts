/**
 * Seed a full ELEVEN room on devnet with two fresh keypairs:
 *   create_room → both join (buy-in) → commit + reveal on 3 markets.
 *
 * Markets + predictions are designed so player A sweeps and player B misses,
 * giving a clear winner to verify the pot movement after the keeper settles.
 * Writes keeper.config.devnet.json + .devnet/room.json for the keeper + verify.
 */
import * as anchor from "@coral-xyz/anchor";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const idl = require("../idl/eleven.json");
const { PublicKey, Keypair, Connection, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction } = anchor.web3;
const BN = anchor.BN;

const RPC = "https://api.devnet.solana.com";
const CLOCK = new PublicKey("SysvarC1ock11111111111111111111111111111111");
const BUY_IN = 0.02 * LAMPORTS_PER_SOL;
const RAKE_BPS = 500;

function loadKp(path: string) {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
}
function le(n: number, bytes: number) {
  const b = Buffer.alloc(bytes);
  if (bytes === 8) b.writeBigUInt64LE(BigInt(n));
  else b.writeUIntLE(n, 0, bytes);
  return b;
}
function commitment(side: number, salt: Buffer, owner: InstanceType<typeof PublicKey>, marketIndex: number) {
  return createHash("sha256")
    .update(Buffer.concat([Buffer.from([side]), salt, owner.toBuffer(), le(marketIndex, 2)]))
    .digest();
}

async function main() {
  const conn = new Connection(RPC, "confirmed");
  const payer = loadKp(join(homedir(), ".config/solana/id.json"));
  const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(payer), { commitment: "confirmed" });
  const program = new anchor.Program(idl, provider);
  const programId = program.programId;
  const log = (m: string, x: unknown = "") => console.log(m, x);

  // ── fresh actors ──────────────────────────────────────────────────────────
  const A = Keypair.generate();
  const B = Keypair.generate();
  const treasury = Keypair.generate();
  const outDir = join(import.meta.dirname, "..", ".devnet");
  mkdirSync(outDir, { recursive: true });

  log("payer", payer.publicKey.toBase58());
  log("player A", A.publicKey.toBase58());
  log("player B", B.publicKey.toBase58());
  log("treasury", treasury.publicKey.toBase58());

  // Fund actors (players pay their own rent + buy-in; treasury pre-funded rent-exempt).
  const fund = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: A.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL }),
    SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: B.publicKey, lamports: 0.04 * LAMPORTS_PER_SOL }),
    SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: treasury.publicKey, lamports: 0.0015 * LAMPORTS_PER_SOL }),
  );
  log("funding actors…", await sendAndConfirmTransaction(conn, fund, [payer]));

  // ── timeline (generous margins for devnet confirmation latency) ─────────────
  const now = Math.floor(Date.now() / 1000);
  const joinDeadline = now + 120;
  const lock = now + 150;
  const resolveDeadline = now + 165;
  const endTs = now + 175;
  const refundDeadline = now + 3600;
  const roomId = Date.now() % 1_000_000_000;

  const [room] = PublicKey.findProgramAddressSync([Buffer.from("room"), A.publicKey.toBuffer(), le(roomId, 8)], programId);
  const partPda = (owner: InstanceType<typeof PublicKey>) =>
    PublicKey.findProgramAddressSync([Buffer.from("participant"), room.toBuffer(), owner.toBuffer()], programId)[0];
  const predPda = (owner: InstanceType<typeof PublicKey>, idx: number) =>
    PublicKey.findProgramAddressSync([Buffer.from("prediction"), room.toBuffer(), le(idx, 2), owner.toBuffer()], programId)[0];

  const market = (statKey: number, threshold: number, yesPoints: number, noPoints: number) => ({
    statKey,
    period: 0,
    threshold: new BN(threshold),
    comparison: 0, // GreaterThan
    hasSecond: false,
    statKey2: 0,
    period2: 0,
    op: 0,
    lockTs: new BN(lock),
    resolveDeadlineTs: new BN(resolveDeadline),
    yesPoints,
    noPoints,
  });
  // idx0 corners>4 (ProveYes), idx1 red card (ProveYes), idx2 away goals>5 (TimeoutNo)
  const markets = [market(6, 4, 100, 100), market(8, 0, 200, 60), market(1, 5, 100, 100)];

  // ── create_room (A = creator + player #1) ──────────────────────────────────
  const createSig = await program.methods
    .createRoom({
      roomId: new BN(roomId),
      fixtureId: 900101,
      buyInLamports: new BN(BUY_IN),
      rakeBps: RAKE_BPS,
      maxPlayers: 4,
      joinDeadlineTs: new BN(joinDeadline),
      endTs: new BN(endTs),
      refundDeadlineTs: new BN(refundDeadline),
      treasury: treasury.publicKey,
      markets,
    })
    .accounts({ creator: A.publicKey, room, participant: partPda(A.publicKey), systemProgram: SystemProgram.programId })
    .signers([A])
    .rpc();
  log("create_room", createSig);
  log("  room PDA", room.toBase58());

  // ── B joins ─────────────────────────────────────────────────────────────
  const joinSig = await program.methods
    .joinRoom()
    .accounts({ joiner: B.publicKey, room, participant: partPda(B.publicKey), systemProgram: SystemProgram.programId })
    .signers([B])
    .rpc();
  log("join_room (B)", joinSig);

  // ── commit + reveal (A sweeps: YES,YES,NO; B misses: NO,NO,YES) ────────────
  const picks: { player: InstanceType<typeof Keypair>; sides: number[] }[] = [
    { player: A, sides: [1, 1, 0] },
    { player: B, sides: [0, 0, 1] },
  ];
  const sigs: Record<string, string> = { create_room: createSig, join_room: joinSig };
  for (const { player, sides } of picks) {
    const who = player === A ? "A" : "B";
    for (let idx = 0; idx < 3; idx++) {
      const side = sides[idx];
      const salt = randomBytes(32);
      const cSig = await program.methods
        .commitPrediction(idx, [...commitment(side, salt, player.publicKey, idx)])
        .accounts({ owner: player.publicKey, room, participant: partPda(player.publicKey), prediction: predPda(player.publicKey, idx), systemProgram: SystemProgram.programId })
        .signers([player])
        .rpc();
      const rSig = await program.methods
        .revealPrediction(idx, side, [...salt])
        .accounts({ owner: player.publicKey, room, prediction: predPda(player.publicKey, idx) })
        .signers([player])
        .rpc();
      log(`commit+reveal ${who} m${idx} side=${side}`, `${cSig.slice(0, 8)}… / ${rSig.slice(0, 8)}…`);
      sigs[`commit_${who}_m${idx}`] = cSig;
      sigs[`reveal_${who}_m${idx}`] = rSig;
    }
  }

  // ── persist for keeper + verify ─────────────────────────────────────────────
  writeFileSync(join(outDir, "A.json"), JSON.stringify([...A.secretKey]));
  writeFileSync(join(outDir, "B.json"), JSON.stringify([...B.secretKey]));
  writeFileSync(join(outDir, "treasury.json"), JSON.stringify([...treasury.secretKey]));
  const state = {
    programId: programId.toBase58(),
    oracleProgramId: "EMYNsu8SXbH7T524CntUo1vS7BgPRR84WoVDUQ2rXJAr",
    room: room.toBase58(),
    roomId,
    A: A.publicKey.toBase58(),
    B: B.publicKey.toBase58(),
    treasury: treasury.publicKey.toBase58(),
    buyIn: BUY_IN,
    rakeBps: RAKE_BPS,
    endTs,
    sigs,
  };
  writeFileSync(join(outDir, "room.json"), JSON.stringify(state, null, 2));

  const config = {
    feed: "sim",
    statePath: ".keeper-state/devnet.json",
    broadcast: true,
    simSpeed: 6,
    rpcUrl: RPC,
    programId: programId.toBase58(),
    keypairPath: join(homedir(), ".config/solana/id.json"),
    oracleProgramId: state.oracleProgramId,
    dailyScoresRoots: CLOCK.toBase58(),
    rooms: [
      {
        roomId: "devnet-e2e",
        fixtureId: 900101,
        endTs: 4102444800, // far future → keeper settles on the full-time event, not the tick
        roomPda: room.toBase58(),
        treasury: treasury.publicKey.toBase58(),
        markets: [
          { index: 0, kind: "cornersOver", statKey: 6, threshold: 4, comparison: "GreaterThan", label: "Total corners over 4" },
          { index: 1, kind: "redCard", statKey: 8, threshold: 0, comparison: "GreaterThan", label: "A red card is shown" },
          { index: 2, kind: "awayGoalsOver", statKey: 1, threshold: 5, comparison: "GreaterThan", label: "Away goals over 5" },
        ],
      },
    ],
  };
  writeFileSync(join(import.meta.dirname, "..", "keeper.config.devnet.json"), JSON.stringify(config, null, 2));

  log("\nseeded. room =", room.toBase58());
  log("on-chain end_ts =", endTs, `(run keeper after ${new Date(endTs * 1000).toISOString()})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
