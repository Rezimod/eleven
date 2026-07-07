import type { Side } from "@/lib/eleven";

/**
 * Free-play bot opponents. FREE-PLAY ONLY — no wallet, no escrow, no on-chain
 * account; they exist purely in the client room engine and score through the same
 * scoring path as a human (`predict` → `playerPoints`). Labeled as bots in the
 * standings so it's always clear who's a dummy.
 */
export const BOTS = ["ByteStriker", "NiaBot"] as const;
export type Bot = (typeof BOTS)[number];

export function isBot(player: string): boolean {
  return (BOTS as readonly string[]).includes(player);
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * A bot's pick for a market, weighted by the market's odds. A pick's points are
 * frozen from its implied probability (points ∝ 1/prob), so the market's implied
 * `yes` probability is recoverable as `noPoints / (yesPoints + noPoints)`. Bots
 * back the more-likely side more often — plausible, never omniscient. Deterministic
 * per (room, market, bot): a re-render never rewrites a committed pick.
 */
export function botPick(
  roomId: string,
  marketId: string,
  bot: string,
  yesPoints: number,
  noPoints: number,
): Side {
  const pYes = noPoints / (yesPoints + noPoints);
  const r = hash(`${roomId}:${marketId}:${bot}`) / 0x1_0000_0000; // uniform [0,1)
  return r < pYes ? "yes" : "no";
}
