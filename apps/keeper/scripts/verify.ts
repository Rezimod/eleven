/** Verify the devnet settlement: room settled, pot moved to the winner, treasury got rake. */
import * as anchor from "@coral-xyz/anchor";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const idl = require("../idl/eleven.json");
const { Connection, PublicKey } = anchor.web3;
const sol = (n: number | bigint) => (Number(n) / anchor.web3.LAMPORTS_PER_SOL).toFixed(6);

async function main() {
  const st = JSON.parse(readFileSync(join(import.meta.dirname, "..", ".devnet", "room.json"), "utf8"));
  const conn = new Connection("https://api.devnet.solana.com", "confirmed");
  const ro = { publicKey: PublicKey.default, signAllTransactions: async (x: unknown) => x, signTransaction: async (x: unknown) => x };
  const program = new anchor.Program(idl, new anchor.AnchorProvider(conn, ro as never, {}));

  const room = await program.account.room.fetch(new PublicKey(st.room));
  const partPda = (owner: string) =>
    PublicKey.findProgramAddressSync([Buffer.from("participant"), new PublicKey(st.room).toBuffer(), new PublicKey(owner).toBuffer()], program.programId)[0];
  const pA = await program.account.participant.fetch(partPda(st.A));
  const pB = await program.account.participant.fetch(partPda(st.B));

  const [balA, balB, balT] = await Promise.all([
    conn.getBalance(new PublicKey(st.A)),
    conn.getBalance(new PublicKey(st.B)),
    conn.getBalance(new PublicKey(st.treasury)),
  ]);

  const rake = Math.floor((st.buyIn * 2 * st.rakeBps) / 10_000);
  console.log("── room ──────────────────────────────");
  console.log("settled:", room.settled, "| state:", JSON.stringify(room.state), "| pot_lamports:", room.potLamports.toString());
  console.log("resolved_market_count:", room.resolvedMarketCount, "/", room.markets.length);
  console.log("market outcomes:", room.markets.map((m: { resolved: boolean; outcome: boolean }) => (m.resolved ? (m.outcome ? "YES" : "NO") : "unresolved")).join(", "));
  console.log("── points ────────────────────────────");
  console.log("A points:", pA.points.toString(), "| B points:", pB.points.toString());
  console.log("── balances (SOL) ────────────────────");
  console.log("winner A:", sol(balA), "| loser B:", sol(balB), "| treasury:", sol(balT));
  console.log("── expected ──────────────────────────");
  console.log("pot:", sol(st.buyIn * 2), "| rake (5%):", sol(rake), "| winner take (pot-rake):", sol(st.buyIn * 2 - rake));
  console.log("treasury = prefund 0.0015 + rake", sol(rake), "=>", sol(1_500_000 + rake));
}
main().catch((e) => console.error(e));
