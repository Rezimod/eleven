/**
 * ELEVEN core engine — UI-agnostic pool / prediction / scoring logic.
 *
 * Pure and deterministic: no React, no DOM, no wallet, no network. The web app
 * (now) and a Telegram Mini App (later) share this exact module. All money math
 * is integer (lamports or free-play points); callers own persistence & I/O.
 */

export type Comparison = "GreaterThan" | "LessThan" | "Equal";

/** `yes` = the market's predicate holds; `no` = it does not. */
export type Side = "yes" | "no";

/** A single "next goal" (or any single-stat) market. */
export interface Market {
  id: string;
  fixtureId: number;
  /** TxLINE ScoreStat.key being predicted (e.g. goals). */
  statKey: number;
  period: number;
  threshold: number;
  comparison: Comparison;
  /** Predictions close at kickoff-relative cutoff (unix seconds). */
  deadlineTs: number;
  homeTeam: string;
  awayTeam: string;
  label: string;
}

export interface Prediction {
  user: string;
  side: Side;
  /** Lamports (USDC pool) or points (free play). */
  stake: number;
  placedAt: number;
}

export interface Pool {
  market: Market;
  predictions: Prediction[];
  settled: boolean;
  /** Whether the predicate held — set at settlement (proven on-chain). */
  outcome?: boolean;
}

export interface StreakState {
  points: number;
  streak: number;
}

// ── construction ────────────────────────────────────────────────────────────

export function newPool(market: Market): Pool {
  return { market, predictions: [], settled: false };
}

/** The on-chain predicate this market commits to (feeds the settlement SDK). */
export function predicateOf(market: Market): { threshold: number; comparison: Comparison } {
  return { threshold: market.threshold, comparison: market.comparison };
}

// ── placing predictions ───────────────────────────────────────────────────

export type Validation = { ok: true } | { ok: false; reason: string };

export function validatePrediction(pool: Pool, p: Prediction, now: number): Validation {
  if (pool.settled) return { ok: false, reason: "market already settled" };
  if (now >= pool.market.deadlineTs) return { ok: false, reason: "market is closed" };
  if (p.stake <= 0) return { ok: false, reason: "stake must be positive" };
  if (pool.predictions.some((x) => x.user === p.user)) {
    return { ok: false, reason: "user already has a prediction in this pool" };
  }
  return { ok: true };
}

/** Immutably append a validated prediction. Throws on invalid input. */
export function placePrediction(pool: Pool, p: Prediction, now: number): Pool {
  const v = validatePrediction(pool, p, now);
  if (!v.ok) throw new Error(v.reason);
  return { ...pool, predictions: [...pool.predictions, p] };
}

// ── pool math (parimutuel) ────────────────────────────────────────────────

export interface PoolTotals {
  yes: number;
  no: number;
  total: number;
}

export function totals(pool: Pool): PoolTotals {
  let yes = 0;
  let no = 0;
  for (const p of pool.predictions) {
    if (p.side === "yes") yes += p.stake;
    else no += p.stake;
  }
  return { yes, no, total: yes + no };
}

/**
 * Parimutuel implied probability for a side, in [0,1]. Empty pool → 0.5.
 * (Display only — the on-chain settlement is deterministic, not odds-based.)
 */
export function impliedProbability(pool: Pool, side: Side): number {
  const t = totals(pool);
  if (t.total === 0) return 0.5;
  return (side === "yes" ? t.yes : t.no) / t.total;
}

// ── settlement + payout ───────────────────────────────────────────────────

/** Record the proven outcome. `outcome` comes from the on-chain validate_stat. */
export function resolve(pool: Pool, outcome: boolean): Pool {
  if (pool.settled) throw new Error("pool already settled");
  return { ...pool, settled: true, outcome };
}

/**
 * Parimutuel payout for `user` after settlement: losers' stake is split across
 * winners pro-rata to stake, plus each winner's own stake back. Losers get 0.
 * If a side had no stake on it, winners simply reclaim their stake (no profit).
 */
export function payout(pool: Pool, user: string): number {
  if (!pool.settled || pool.outcome === undefined) throw new Error("pool not settled");
  const winningSide: Side = pool.outcome ? "yes" : "no";
  const t = totals(pool);
  const winPool = winningSide === "yes" ? t.yes : t.no;
  const losePool = t.total - winPool;
  const mine = pool.predictions.find((p) => p.user === user);
  if (!mine || mine.side !== winningSide || winPool === 0) return 0;
  // integer, floor-rounded share of the losing pool
  const share = Math.floor((mine.stake * losePool) / winPool);
  return mine.stake + share;
}

// ── free-play scoring (the consumer/fan dopamine loop) ────────────────────

const BASE_POINTS = 100;

/** Correct predictions build a streak; each streak step adds a 25% multiplier. */
export function scoreRound(prev: StreakState, correct: boolean): StreakState {
  if (!correct) return { points: prev.points, streak: 0 };
  const streak = prev.streak + 1;
  const multiplier = 1 + 0.25 * (streak - 1);
  return { points: prev.points + Math.round(BASE_POINTS * multiplier), streak };
}

// ── display helpers ─────────────────────────────────────────────────────────

const CMP_SYMBOL: Record<Comparison, string> = {
  GreaterThan: ">",
  LessThan: "<",
  Equal: "=",
};

export function describeMarket(m: Market): string {
  return `${m.homeTeam} vs ${m.awayTeam} — ${m.label} (stat ${m.statKey} ${CMP_SYMBOL[m.comparison]} ${m.threshold})`;
}
