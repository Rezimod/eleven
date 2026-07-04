import type { Market, Prediction, Side } from "@/lib/eleven";

/** Deterministic "crowd" so the parimutuel pool + leaderboard feel alive. */
export const BOTS = [
  "Zico_88",
  "La Pulga",
  "GolMachine",
  "xG_Nerd",
  "TerraceTom",
  "VAR_Villain",
  "Panenka",
  "NutmegNik",
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Seeded bot predictions for a market — same market id → same crowd. */
export function botPredictions(market: Market, now: number): Prediction[] {
  return BOTS.map((name) => {
    const h = hash(`${market.id}:${name}`);
    const side: Side = h % 100 < 52 ? "yes" : "no";
    const stake = 50 + (Math.floor(h / 100) % 160);
    return { user: name, side, stake, placedAt: now - 1 };
  });
}
