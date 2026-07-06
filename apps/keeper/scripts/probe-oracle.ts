/** FREE probe: simulate resolve_market{ProveYes} on the settled room to learn
 * which oracle address the DEPLOYED eleven enforces (address constraint runs
 * before the handler). No SOL spent — simulateTransaction only. */
import * as anchor from "@coral-xyz/anchor";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const idl = require("../idl/eleven.json");
const { Connection, PublicKey, Keypair } = anchor.web3;
const BN = anchor.BN;

const ROOM = "CttCiSnh8RzB6Dovq4DNqS8BkKQ1aPGEKHMEe7oztV9W";
const CLOCK = new PublicKey("SysvarC1ock11111111111111111111111111111111");
const CANDIDATES: Record<string, string> = {
  EMYNsu_mock: "EMYNsu8SXbH7T524CntUo1vS7BgPRR84WoVDUQ2rXJAr",
  "6pW6_realTxoracle": "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J",
};

const dummyNode = { hash: Array(32).fill(1), isRightSibling: true };
const dummyStat = { statToProve: { key: 6, value: 5, period: 0 }, eventStatRoot: Array(32).fill(2), statProof: [dummyNode] };

async function main() {
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config/solana/id.json"), "utf8"))));
  const conn = new Connection("https://api.devnet.solana.com", "confirmed");
  const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(payer), { commitment: "confirmed" });
  const program = new anchor.Program(idl, provider);

  for (const [name, addr] of Object.entries(CANDIDATES)) {
    const args = {
      marketIndex: 0,
      kind: { proveYes: {} },
      targetTs: new BN(Math.floor(Date.now() / 1000)),
      fixtureSummary: { fixtureId: new BN(900101), updateStats: { updateCount: 1, minTimestamp: new BN(0), maxTimestamp: new BN(0) }, eventsSubTreeRoot: Array(32).fill(3) },
      fixtureProof: [dummyNode],
      mainTreeProof: [dummyNode],
      statA: dummyStat,
      statB: null,
      op: null,
    };
    try {
      const tx = await program.methods
        .resolveMarket(args)
        .accounts({ settler: payer.publicKey, room: new PublicKey(ROOM), txlineOracle: new PublicKey(addr), dailyScoresRoots: CLOCK })
        .transaction();
      tx.feePayer = payer.publicKey;
      tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
      const sim = await conn.simulateTransaction(tx, undefined, false);
      const logs = sim.value.logs ?? [];
      const errStr = JSON.stringify(sim.value.err);
      const rel = logs.filter((l) => /Error|failed|Program log:|constraint|Oracle|Mismatch|Resolved/i.test(l)).slice(-8);
      console.log(`\n== oracle=${name} (${addr}) ==`);
      console.log("err:", errStr);
      console.log(rel.join("\n"));
    } catch (e) {
      console.log(`\n== oracle=${name} (${addr}) ==\nbuild/sim threw:`, String(e).slice(0, 300));
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
