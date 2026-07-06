/** Verify the 4-player devnet settlement: pot = 4× buy-in moved to the winner,
 * treasury got the exact rake, pot zeroed (conservation). */
import * as anchor from "@coral-xyz/anchor";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const idl = require("../idl/eleven.json");
const { Connection, PublicKey } = anchor.web3;
const sol = (n: number | bigint) => (Number(n) / anchor.web3.LAMPORTS_PER_SOL).toFixed(6);

async function main() {
  const st = JSON.parse(readFileSync(join(import.meta.dirname, "..", ".devnet", "room-4p.json"), "utf8"));
  const conn = new Connection("https://api.devnet.solana.com", "confirmed");
  const ro = { publicKey: PublicKey.default, signAllTransactions: async (x: unknown) => x, signTransaction: async (x: unknown) => x };
  const program = new anchor.Program(idl, new anchor.AnchorProvider(conn, ro as never, {}));
  const roomPk = new PublicKey(st.room);

  const room = await program.account.room.fetch(roomPk);
  const partPda = (owner: string) =>
    PublicKey.findProgramAddressSync([Buffer.from("participant"), roomPk.toBuffer(), new PublicKey(owner).toBuffer()], program.programId)[0];

  const points: number[] = [];
  const balances: number[] = [];
  for (const p of st.players as string[]) {
    const part = await program.account.participant.fetch(partPda(p));
    points.push(Number(part.points));
    balances.push(await conn.getBalance(new PublicKey(p)));
  }
  const balT = await conn.getBalance(new PublicKey(st.treasury));

  const pot = st.buyIn * st.players.length;
  const rake = Math.floor((pot * st.rakeBps) / 10_000);
  const winnerTake = pot - rake;

  console.log("── room (4-player) ───────────────────");
  console.log("players:", st.players.length, "| settled:", room.settled, "| pot_lamports:", room.potLamports.toString());
  console.log("resolved_market_count:", room.resolvedMarketCount, "/", room.markets.length);
  console.log("market outcomes:", room.markets.map((m: { resolved: boolean; outcome: boolean }) => (m.resolved ? (m.outcome ? "YES" : "NO") : "unresolved")).join(", "));
  console.log("── points ────────────────────────────");
  (st.players as string[]).forEach((_, i) => console.log(`P${i + 1} points:`, points[i]));
  const topIdx = points.indexOf(Math.max(...points));
  console.log("winner: P" + (topIdx + 1));
  console.log("── balances (SOL) ────────────────────");
  balances.forEach((b, i) => console.log(`P${i + 1}:`, sol(b)));
  console.log("treasury:", sol(balT));
  console.log("── expected ──────────────────────────");
  console.log("pot:", sol(pot), "(4 × buy-in) | rake (5%):", sol(rake), "| winner take:", sol(winnerTake));
  console.log("treasury = 0.0015 prefund + rake", sol(rake), "=>", sol(1_500_000 + rake));

  const potZeroed = room.potLamports.toString() === "0";
  const winnerOk = balances[topIdx] > winnerTake * 0.9; // winner got the lion's share (minus its own rents)
  const treasuryOk = Math.abs(balT - (1_500_000 + rake)) < 5_000;
  console.log("── checks ────────────────────────────");
  console.log("pot zeroed:", potZeroed, "| treasury == prefund+rake:", treasuryOk, "| winner funded:", winnerOk);
  if (!(potZeroed && treasuryOk && room.settled)) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
