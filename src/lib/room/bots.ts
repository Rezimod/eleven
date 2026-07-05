import type { Side } from "@/lib/eleven";

/** Deterministic "crowd" so rooms and standings feel alive without a backend. */
export const BOTS = [
  "Zico_88",
  "La Pulga",
  "GolMachine",
  "xG_Nerd",
  "TerraceTom",
  "VAR_Villain",
  "Panenka",
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Seeded bot pick for a market — same (room, market, bot) → same side. */
export function botSide(roomId: string, marketId: string, bot: string): Side {
  return hash(`${roomId}:${marketId}:${bot}`) % 100 < 52 ? "yes" : "no";
}
