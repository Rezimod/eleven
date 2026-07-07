/**
 * ELEVEN core engine — UI-agnostic room / multi-event / scoring logic.
 *
 * Pure and deterministic: no React, no DOM, no wallet, no network. The web app
 * (now) and a Telegram Mini App (later) share this exact module. It mirrors the
 * on-chain `eleven` program 1:1 — same fairness model, same integer math — so
 * the UI can predict outcomes the chain will confirm.
 *
 * Fairness (fixes pay-to-win):
 *   - Fixed buy-in per room; the pot is buy_in × players. Stake never buys points.
 *   - Points come ONLY from correct, revealed predictions; everyone starts at 0.
 *   - A market's points scale with its odds (longer odds → more points).
 *   - Winner(s) = most points → take the pot minus a capped rake; ties split equally.
 */

export type Comparison = "GreaterThan" | "LessThan" | "EqualTo";
export type BinaryOp = "Add" | "Subtract";

/** `yes` = the market's predicate holds; `no` = it does not. */
export type Side = "yes" | "no";

/** Rake is capped at 10% — mirrors `MAX_RAKE_BPS` on-chain. */
export const MAX_RAKE_BPS = 1_000;
export const MIN_PLAYERS = 2;

/**
 * The on-chain room state machine: Lobby → Live → FullTime → Settled (Refunding
 * is the void branch). Mirrors `RoomPhase` on-chain.
 */
export type RoomPhase = "lobby" | "live" | "fulltime" | "settled" | "refunding";

/** Phase implied by the clock (terminal phases are sticky, decided by the caller). */
export function phaseOf(kickoffTs: number, endTs: number, now: number): RoomPhase {
  if (now >= endTs) return "fulltime";
  if (now >= kickoffTs) return "live";
  return "lobby";
}

// ── markets (provable predicates over TxLINE-proven stats) ───────────────────

/**
 * A provable market: a `validate_stat` predicate over a stat TxLINE proves
 * (goals / corners / cards). `yes` iff the predicate holds by full time.
 *   single-stat: `stat(key,period) <cmp> threshold`
 *   two-stat:    `(statA <op> statB) <cmp> threshold`  (e.g. A goals − B goals > 0)
 */
export interface MarketSpec {
  id: string;
  label: string;
  statKey: number;
  period: number;
  threshold: number;
  comparison: Comparison;
  hasSecond?: boolean;
  statKey2?: number;
  period2?: number;
  op?: BinaryOp;
  /** Commit + reveal must both land before this (unix seconds). */
  lockTs: number;
  /** A `no` (timeout) resolution is only allowed after this. */
  resolveDeadlineTs: number;
  yesPoints: number;
  noPoints: number;
}

export interface MarketState {
  resolved: boolean;
  /** true = predicate held (`yes`), false = did not (`no`). */
  outcome?: boolean;
}

export interface Prediction {
  player: string;
  marketId: string;
  side: Side;
}

export type RoomStatus = "open" | "settled" | "refunding";

export interface Room {
  id: string;
  fixtureId: number;
  /** Fixed buy-in every player pays (0 = free-play, points only). */
  buyIn: number;
  rakeBps: number;
  maxPlayers: number;
  joinDeadline: number;
  endTs: number;
  refundDeadline: number;
  markets: MarketSpec[];
  players: string[];
  predictions: Prediction[];
  marketState: Record<string, MarketState>;
  status: RoomStatus;
}

export interface RoomConfig {
  id: string;
  fixtureId: number;
  creator: string;
  buyIn: number;
  rakeBps: number;
  maxPlayers: number;
  joinDeadline: number;
  endTs: number;
  refundDeadline: number;
  markets: MarketSpec[];
}

// ── odds → points (longer odds earn more) ────────────────────────────────────

export const BASE_POINTS = 50;
export const MIN_MARKET_POINTS = 10;
export const MAX_MARKET_POINTS = 1_000;

/**
 * ANTI-DRAIN cap — the most points one market can award a player. A pick's odds
 * snapshot is frozen and clamped to this at lock, so a single longshot can't
 * dominate the pot. Mirrors `MAX_POINTS_PER_MARKET` on-chain.
 */
export const MAX_POINTS_PER_MARKET = MAX_MARKET_POINTS;

/** Freeze a pick's award: the odds-derived points, clamped to the cap. Immutable
 *  once taken — scoring reads this, never recomputes, so stake can't change it. */
export function freezeAward(points: number): number {
  return Math.min(points, MAX_POINTS_PER_MARKET);
}

/**
 * Points for correctly calling an outcome with implied probability `prob`.
 * Longer odds (smaller `prob`) pay more. Deterministic integer output.
 */
export function pointsFromOdds(prob: number): number {
  const p = Math.min(0.99, Math.max(0.01, prob));
  const pts = Math.round(BASE_POINTS / p);
  return Math.min(MAX_MARKET_POINTS, Math.max(MIN_MARKET_POINTS, pts));
}

/** yes/no point values from the `yes` implied probability (TxLINE odds or a table). */
export function marketPoints(yesProb: number): { yesPoints: number; noPoints: number } {
  return { yesPoints: pointsFromOdds(yesProb), noPoints: pointsFromOdds(1 - yesProb) };
}

// ── room lifecycle (pure, immutable) ─────────────────────────────────────────

export function createRoom(cfg: RoomConfig): Room {
  if (cfg.rakeBps > MAX_RAKE_BPS) throw new Error("rake exceeds the 10% cap");
  if (cfg.maxPlayers < MIN_PLAYERS) throw new Error("maxPlayers below MIN_PLAYERS");
  if (!cfg.markets.length) throw new Error("a room needs at least one market");
  if (!(cfg.joinDeadline < cfg.endTs && cfg.endTs <= cfg.refundDeadline)) {
    throw new Error("deadlines out of order");
  }
  const marketState: Record<string, MarketState> = {};
  for (const m of cfg.markets) {
    if (m.yesPoints <= 0 || m.noPoints <= 0) throw new Error("market points must be positive");
    marketState[m.id] = { resolved: false };
  }
  return {
    id: cfg.id,
    fixtureId: cfg.fixtureId,
    buyIn: cfg.buyIn,
    rakeBps: cfg.rakeBps,
    maxPlayers: cfg.maxPlayers,
    joinDeadline: cfg.joinDeadline,
    endTs: cfg.endTs,
    refundDeadline: cfg.refundDeadline,
    markets: cfg.markets,
    players: [cfg.creator], // creator is player #1
    predictions: [],
    marketState,
    status: "open",
  };
}

/**
 * Add a market to an open room after creation. Free-play only — the on-chain path
 * commits its markets inline at creation; this backs the live-wave generator, which
 * opens provable markets as the match unfolds. Mirrors createRoom's per-market init.
 */
export function addMarket(room: Room, spec: MarketSpec): Room {
  if (room.markets.some((m) => m.id === spec.id)) return room;
  if (spec.yesPoints <= 0 || spec.noPoints <= 0) throw new Error("market points must be positive");
  return {
    ...room,
    markets: [...room.markets, spec],
    marketState: { ...room.marketState, [spec.id]: { resolved: false } },
  };
}

export function joinRoom(room: Room, player: string, now: number): Room {
  if (room.status !== "open") throw new Error("room is not open");
  if (now >= room.joinDeadline) throw new Error("join window closed");
  if (room.players.length >= room.maxPlayers) throw new Error("room is full");
  if (room.players.includes(player)) throw new Error("already joined");
  return { ...room, players: [...room.players, player] };
}

/** Commit-and-reveal a prediction (the pure engine models the resolved pick). */
export function predict(room: Room, player: string, marketId: string, side: Side, now: number): Room {
  const market = room.markets.find((m) => m.id === marketId);
  if (!market) throw new Error("no such market");
  if (!room.players.includes(player)) throw new Error("not a player in this room");
  if (now >= market.lockTs) throw new Error("market is locked");
  if (room.marketState[marketId]?.resolved) throw new Error("market already resolved");
  if (room.predictions.some((p) => p.player === player && p.marketId === marketId)) {
    throw new Error("already predicted this market");
  }
  return { ...room, predictions: [...room.predictions, { player, marketId, side }] };
}

/** Resolve a market once. `outcome` comes from a proof (yes) or a timeout (no). */
export function resolveMarket(room: Room, marketId: string, outcome: boolean): Room {
  const st = room.marketState[marketId];
  if (!st) throw new Error("no such market");
  if (st.resolved) throw new Error("market already resolved");
  return { ...room, marketState: { ...room.marketState, [marketId]: { resolved: true, outcome } } };
}

export function allMarketsResolved(room: Room): boolean {
  return room.markets.every((m) => room.marketState[m.id]?.resolved);
}

// ── scoring (deterministic; reproducible from predictions + outcomes) ────────

/** Points a single revealed prediction earns given the market's proven outcome. */
export function scorePrediction(market: MarketSpec, side: Side, outcome: boolean): number {
  const winSide: Side = outcome ? "yes" : "no";
  if (side !== winSide) return 0;
  return outcome ? market.yesPoints : market.noPoints;
}

export function playerPoints(room: Room, player: string): number {
  let pts = 0;
  for (const pr of room.predictions) {
    if (pr.player !== player) continue;
    const st = room.marketState[pr.marketId];
    if (!st?.resolved || st.outcome === undefined) continue;
    const m = room.markets.find((x) => x.id === pr.marketId)!;
    pts += scorePrediction(m, pr.side, st.outcome);
  }
  return pts;
}

export interface Standing {
  player: string;
  points: number;
}

/** Standings, points desc then player id asc — deterministic and stable. */
export function standings(room: Room): Standing[] {
  return room.players
    .map((player) => ({ player, points: playerPoints(room, player) }))
    .sort((a, b) => b.points - a.points || (a.player < b.player ? -1 : 1));
}

/** Winner(s) = players with the max points, sorted by id (matches on-chain order). */
export function winners(room: Room): string[] {
  const s = standings(room);
  const max = s.length ? s[0].points : 0;
  return s
    .filter((x) => x.points === max)
    .map((x) => x.player)
    .sort();
}

// ── pot split (mirrors settle_room exactly) ──────────────────────────────────

export interface Split {
  rake: number;
  perWinner: number;
  /** Distributed +1 each to the first `dust` winners (sorted) — pot conserved. */
  dust: number;
}

export function splitPot(pot: number, rakeBps: number, winnerCount: number): Split {
  if (rakeBps > MAX_RAKE_BPS) throw new Error("rake exceeds the 10% cap");
  if (winnerCount <= 0) throw new Error("winnerCount must be positive");
  const rake = Math.floor((pot * rakeBps) / 10_000);
  const distributable = pot - rake;
  const perWinner = Math.floor(distributable / winnerCount);
  const dust = distributable - perWinner * winnerCount;
  return { rake, perWinner, dust };
}

export interface Payout {
  player: string;
  amount: number;
}

export interface Settlement {
  winners: string[];
  payouts: Payout[];
  rake: number;
  pot: number;
}

/** The exact settlement a room will pay: pot = buy_in × players. */
export function settle(room: Room): Settlement {
  const pot = room.buyIn * room.players.length;
  const w = winners(room);
  const { rake, perWinner, dust } = splitPot(pot, room.rakeBps, w.length);
  const payouts: Payout[] = w.map((player, i) => ({
    player,
    amount: perWinner + (i < dust ? 1 : 0),
  }));
  return { winners: w, payouts, rake, pot };
}

// ── display helpers ──────────────────────────────────────────────────────────

const CMP_SYMBOL: Record<Comparison, string> = {
  GreaterThan: ">",
  LessThan: "<",
  EqualTo: "=",
};

/** The on-chain predicate this market commits to (feeds the settlement SDK). */
export function predicateOf(m: MarketSpec): { threshold: number; comparison: Comparison } {
  return { threshold: m.threshold, comparison: m.comparison };
}

export function describeMarket(m: MarketSpec): string {
  const base = `stat ${m.statKey} ${CMP_SYMBOL[m.comparison]} ${m.threshold}`;
  return m.hasSecond ? `${m.label} (statA ${m.op} statB ${CMP_SYMBOL[m.comparison]} ${m.threshold})` : `${m.label} (${base})`;
}
