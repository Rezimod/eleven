/** FREE probe: run the REAL TxOracle `validate_stat` verifier against a REAL
 * TxLINE stat-validation proof, by simulation (no SOL, no broadcast, no redeploy).
 *
 * This is the honest end-to-end check of the trustless-settlement claim: it fetches
 * the real Merkle proof for a fixture/stat from `/api/scores/stat-validation`,
 * derives the real on-chain `daily_scores_roots` PDA for the proof's epoch day, and
 * asks the deployed TxOracle (devnet 6pW64…) to verify it. The oracle's own logs
 * tell you whether the proof passes fixture-level validation against the on-chain
 * root — the exact thing `resolve_market` does via CPI.
 *
 * Reads TXLINE_API_KEY + TXLINE_ORIGIN from env or .env.local. Payer = ~/.config/solana/id.json.
 * Usage: node scripts/probe-real-validate.ts [fixtureId] [statKey] [seq]
 *        statKey: 1=goals, 6=corners, 8=cards (default 18198205 1 0).
 */
import * as anchor from "@coral-xyz/anchor";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
// The TxOracle IDL is vendored at the repo root (anchor/idl), not in apps/keeper/idl.
const idl = require("../../../anchor/idl/txoracle.json");
const { Connection, PublicKey, Keypair, TransactionMessage, VersionedTransaction } = anchor.web3;
const BN = anchor.BN;

// The real TxOracle on devnet (the `eleven` program pins this as TXORACLE_DEVNET).
const TXORACLE_DEVNET = "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J";
const RPC = process.env.DEVNET_RPC ?? "https://api.devnet.solana.com";

// --- minimal .env.local loader (same pattern as scripts/txline-probe.ts) ----
try {
  for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  try {
    for (const line of readFileSync(join(process.cwd(), "../../.env.local"), "utf8").split("\n")) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* rely on real env */
  }
}

const ORIGIN = process.env.TXLINE_ORIGIN ?? "https://txline.txodds.com";
const API_TOKEN = process.env.TXLINE_API_KEY ?? "";
const FIXTURE = Number(process.argv[2] ?? 18198205);
const STATKEY = Number(process.argv[3] ?? 1);
const SEQ = Number(process.argv[4] ?? 0);

/** 32-byte root/hash: the API returns these as number arrays, hex, or base64. */
function to32(x: unknown): number[] {
  if (Array.isArray(x)) return x.map(Number);
  const s = String(x);
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(s)) return [...Buffer.from(s.replace(/^0x/, ""), "hex")];
  return [...Buffer.from(s, "base64")];
}
const mapNode = (n: { hash: unknown; isRightSibling: boolean }) => ({ hash: to32(n.hash), isRightSibling: !!n.isRightSibling });

async function guestJwt(): Promise<string> {
  const r = await fetch(`${ORIGIN}/auth/guest/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  if (!r.ok) throw new Error(`guest/start HTTP ${r.status}`);
  return ((await r.json()) as { token: string }).token;
}

async function main() {
  if (!API_TOKEN) throw new Error("TXLINE_API_KEY not set (env or .env.local)");
  const jwt = await guestJwt();
  const u = new URL(`${ORIGIN}/api/scores/stat-validation`);
  u.searchParams.set("fixtureId", String(FIXTURE));
  u.searchParams.set("seq", String(SEQ));
  u.searchParams.set("statKey", String(STATKEY));
  const res = await fetch(u, { headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": API_TOKEN } });
  if (!res.ok) throw new Error(`stat-validation HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = (await res.json()) as any;

  console.log(`fixture=${FIXTURE} statKey=${STATKEY} seq=${SEQ}`);
  console.log(`proof: value=${v.statToProve.value} ts=${v.ts} (${new Date(v.ts).toISOString()})`);
  const epochDay = Math.floor(v.ts / 86400000);
  const b = Buffer.alloc(2);
  b.writeUInt16LE(epochDay, 0);
  const oracle = new PublicKey(TXORACLE_DEVNET);
  const rootsPda = PublicKey.findProgramAddressSync([Buffer.from("daily_scores_roots"), b], oracle)[0];
  console.log(`epochDay=${epochDay} daily_scores_roots=${rootsPda.toBase58()}`);
  console.log(`proof nodes: stat=${v.statProof.length} subTree=${v.subTreeProof.length} mainTree=${v.mainTreeProof.length}\n`);

  idl.address = TXORACLE_DEVNET;
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config/solana/id.json"), "utf8"))));
  const conn = new Connection(RPC, "confirmed");
  const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(payer), { commitment: "confirmed" });
  const program = new anchor.Program(idl, provider);

  const fixtureSummary = {
    fixtureId: new BN(v.summary.fixtureId),
    updateStats: { updateCount: v.summary.updateStats.updateCount, minTimestamp: new BN(v.summary.updateStats.minTimestamp), maxTimestamp: new BN(v.summary.updateStats.maxTimestamp) },
    eventsSubTreeRoot: to32(v.summary.eventStatsSubTreeRoot),
  };
  const statA = { statToProve: v.statToProve, eventStatRoot: to32(v.eventStatRoot), statProof: v.statProof.map(mapNode) };
  // Predicate `value > value-1` is trivially true, so success ⟺ the proof verified.
  const predicate = { threshold: v.statToProve.value - 1, comparison: { greaterThan: {} } };

  const ix = await program.methods
    .validateStat(new BN(v.ts), fixtureSummary, v.subTreeProof.map(mapNode), v.mainTreeProof.map(mapNode), predicate, statA, null, null)
    .accounts({ dailyScoresMerkleRoots: rootsPda })
    .instruction();
  const bh = (await conn.getLatestBlockhash()).blockhash;
  const msg = new TransactionMessage({ payerKey: payer.publicKey, recentBlockhash: bh, instructions: [ix] }).compileToV0Message();
  const sim = await conn.simulateTransaction(new VersionedTransaction(msg), { sigVerify: false, replaceRecentBlockhash: true });

  console.log("── real TxOracle validate_stat simulation ──");
  console.log("err:", JSON.stringify(sim.value.err));
  for (const l of (sim.value.logs ?? []).filter((x) => /Program log:|Error|verif|root|valid|proof|predicate/i.test(x))) console.log("  " + l);
  const passedFixture = (sim.value.logs ?? []).some((l) => /Pass fixture-level validation/i.test(l));
  console.log(`\nverdict: fixture-level proof ${passedFixture ? "VERIFIED against the real on-chain root ✓" : "did NOT verify ✗"}` + (sim.value.err ? `; instruction err=${JSON.stringify(sim.value.err)} (StatNotZero ⇒ no non-zero stat to prove yet)` : "; validate_stat succeeded ✓"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
