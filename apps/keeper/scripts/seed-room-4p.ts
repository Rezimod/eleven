/**
 * Seed a FOUR-player ELEVEN room on devnet:
 *   create_room (P1) → P2,P3,P4 join (pot = 4 × buy-in) → commit + reveal on 3
 *   markets. All three markets cross TRUE in the sim, so every market resolves
 *   via the validate_stat ProveYes CPI. Picks give a clean single winner (P1).
 *
 * Writes keeper.config.devnet-4p.json + .devnet/room-4p.json for the keeper + verify.
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

const RPC = process.env.DEVNET_RPC ?? "https://api.devnet.solana.com";
const CLOCK = new PublicKey("SysvarC1ock11111111111111111111111111111111");
const ORACLE = "EMYNsu8SXbH7T524CntUo1vS7BgPRR84WoVDUQ2rXJAr";
const BUY_IN = 0.02 * LAMPORTS_PER_SOL;
const RAKE_BPS = 500;
// Public devnet RPC rate-limits bursts (429); space out the ~28 seed txs.
const THROTTLE_MS = Number(process.env.SEED_THROTTLE_MS ?? "900");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

  // Four fresh players; P1 is creator + player #1.
  const players = [Keypair.generate(), Keypair.generate(), Keypair.generate(), Keypair.generate()];
  const [P1] = players;
  const treasury = Keypair.generate();
  const outDir = join(import.meta.dirname, "..", ".devnet");
  mkdirSync(outDir, { recursive: true });

  players.forEach((p, i) => log(`player P${i + 1}`, p.publicKey.toBase58()));
  log("treasury", treasury.publicKey.toBase58());

  // Fund each player (rent + buy-in) and pre-fund treasury rent-exempt.
  const fund = new Transaction().add(
    ...players.map((p) => SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: p.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL })),
    SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: treasury.publicKey, lamports: 0.0015 * LAMPORTS_PER_SOL }),
  );
  log("funding actors…", await sendAndConfirmTransaction(conn, fund, [payer]));

  const now = Math.floor(Date.now() / 1000);
  const joinDeadline = now + 280;
  const lock = now + 320;
  const resolveDeadline = now + 340;
  const endTs = now + 355;
  const refundDeadline = now + 3600;
  const roomId = Date.now() % 1_000_000_000;

  const [room] = PublicKey.findProgramAddressSync([Buffer.from("room"), P1.publicKey.toBuffer(), le(roomId, 8)], programId);
  const partPda = (owner: InstanceType<typeof PublicKey>) =>
    PublicKey.findProgramAddressSync([Buffer.from("participant"), room.toBuffer(), owner.toBuffer()], programId)[0];
  const predPda = (owner: InstanceType<typeof PublicKey>, idx: number) =>
    PublicKey.findProgramAddressSync([Buffer.from("prediction"), room.toBuffer(), le(idx, 2), owner.toBuffer()], programId)[0];

  const market = (statKey: number, threshold: number, yesPoints: number, noPoints: number) => ({
    statKey, period: 0, threshold: new BN(threshold), comparison: 0, hasSecond: false,
    statKey2: 0, period2: 0, op: 0, lockTs: new BN(lock), resolveDeadlineTs: new BN(resolveDeadline), yesPoints, noPoints,
  });
  // corners>4, red card, home goals>2 — all cross TRUE in the sim (all ProveYes).
  const markets = [market(6, 4, 100, 100), market(8, 0, 100, 100), market(1, 2, 100, 100)];

  const createSig = await program.methods
    .createRoom({
      roomId: new BN(roomId), fixtureId: 900101, buyInLamports: new BN(BUY_IN), rakeBps: RAKE_BPS,
      maxPlayers: 4, joinDeadlineTs: new BN(joinDeadline), endTs: new BN(endTs), refundDeadlineTs: new BN(refundDeadline),
      treasury: treasury.publicKey, markets,
    })
    .accounts({ creator: P1.publicKey, room, participant: partPda(P1.publicKey), systemProgram: SystemProgram.programId })
    .signers([P1])
    .rpc();
  log("create_room (P1)", createSig);
  log("  room PDA", room.toBase58());

  const sigs: Record<string, string> = { create_room: createSig };
  for (let i = 1; i < players.length; i++) {
    const joinSig = await program.methods
      .joinRoom()
      .accounts({ joiner: players[i].publicKey, room, participant: partPda(players[i].publicKey), systemProgram: SystemProgram.programId })
      .signers([players[i]])
      .rpc();
    sigs[`join_P${i + 1}`] = joinSig;
    log(`join_room (P${i + 1})`, joinSig);
    await sleep(THROTTLE_MS);
  }

  // Picks → P1 sweeps (300, winner), P2 200, P3 100, P4 0. All markets resolve YES.
  const picks = [
    [1, 1, 1],
    [1, 1, 0],
    [1, 0, 0],
    [0, 0, 0],
  ];
  for (let pi = 0; pi < players.length; pi++) {
    const player = players[pi];
    for (let idx = 0; idx < 3; idx++) {
      const side = picks[pi][idx];
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
      log(`commit+reveal P${pi + 1} m${idx} side=${side}`, `${cSig.slice(0, 8)}… / ${rSig.slice(0, 8)}…`);
      sigs[`commit_P${pi + 1}_m${idx}`] = cSig;
      sigs[`reveal_P${pi + 1}_m${idx}`] = rSig;
      await sleep(THROTTLE_MS);
    }
  }

  players.forEach((p, i) => writeFileSync(join(outDir, `P${i + 1}.json`), JSON.stringify([...p.secretKey])));
  writeFileSync(join(outDir, "treasury-4p.json"), JSON.stringify([...treasury.secretKey]));
  const state = {
    programId: programId.toBase58(), oracleProgramId: ORACLE, room: room.toBase58(), roomId,
    players: players.map((p) => p.publicKey.toBase58()), treasury: treasury.publicKey.toBase58(),
    buyIn: BUY_IN, rakeBps: RAKE_BPS, endTs, sigs,
  };
  writeFileSync(join(outDir, "room-4p.json"), JSON.stringify(state, null, 2));

  const config = {
    feed: "sim", statePath: ".keeper-state/devnet-4p.json", broadcast: true, simSpeed: 6, rpcUrl: RPC,
    programId: programId.toBase58(), keypairPath: join(homedir(), ".config/solana/id.json"),
    oracleProgramId: ORACLE, dailyScoresRoots: CLOCK.toBase58(),
    rooms: [{
      roomId: "devnet-e2e-4p", fixtureId: 900101, endTs: 4102444800, roomPda: room.toBase58(), treasury: treasury.publicKey.toBase58(),
      markets: [
        { index: 0, kind: "cornersOver", statKey: 6, threshold: 4, comparison: "GreaterThan", label: "Total corners over 4" },
        { index: 1, kind: "redCard", statKey: 8, threshold: 0, comparison: "GreaterThan", label: "A red card is shown" },
        { index: 2, kind: "homeGoalsOver", statKey: 1, threshold: 2, comparison: "GreaterThan", label: "Home goals over 2" },
      ],
    }],
  };
  writeFileSync(join(import.meta.dirname, "..", "keeper.config.devnet-4p.json"), JSON.stringify(config, null, 2));

  log("\nseeded 4-player room =", room.toBase58());
  log("pot =", `${(BUY_IN * 4) / LAMPORTS_PER_SOL} SOL (4 × buy-in)`);
  log("on-chain end_ts =", endTs, `(run keeper after ${new Date(endTs * 1000).toISOString()})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
