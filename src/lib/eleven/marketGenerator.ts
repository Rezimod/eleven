/**
 * ELEVEN — smart market generator (the "live bets" engine).
 *
 * UI-agnostic and deterministic (no React, no DOM, no network) — same module the
 * web app and a Telegram Mini App share. It consumes a live fixture's rolling
 * stats and, when a TRIGGER fires, opens a time-boxed market that always SETTLES
 * on a PROVABLE predicate.
 *
 * ── The one non-negotiable rule ──────────────────────────────────────────────
 * A market may be TRIGGERED by ANY stat (shots, possession, momentum, attacks …)
 * but every market MUST RESOLVE via a `validate_stat` Merkle proof on a PROVABLE
 * stat — goals, corners, or cards. Never shots/fouls/possession. This is enforced
 * in code: `buildMarket` throws if a template ever emits a non-provable predicate,
 * so an accidental non-provable market can't reach settlement.
 */

import { marketPoints, type Comparison, type MarketSpec } from "./core.ts";

// ── provable stats — the ONLY stats a market may settle on ────────────────────

/** Stat keys TxLINE proves and the on-chain `validate_stat` can verify. */
export const STAT_KEY = { GOALS: 1, CORNERS: 6, RED_CARDS: 8 } as const;

/** The whitelist. A predicate's `statKey` MUST be in here or it can't settle. */
export const PROVABLE_STAT_KEYS: ReadonlySet<number> = new Set([
  STAT_KEY.GOALS,
  STAT_KEY.CORNERS,
  STAT_KEY.RED_CARDS,
]);

export function isProvableStat(statKey: number): boolean {
  return PROVABLE_STAT_KEYS.has(statKey);
}

// ── live fixture stats (provable counters + context/trigger-only signals) ─────

export interface FixtureStats {
  minute: number;
  // provable — a market may settle on these
  goals: number;
  homeGoals: number;
  awayGoals: number;
  corners: number;
  redCards: number;
  // context — TRIGGER-ONLY / DISPLAY-ONLY, a market may NEVER settle on these
  shots: number;
  shotsOnTarget: number;
  /** Home possession share, 0–100. */
  possessionHome: number;
  attacks: number;
  dangerousAttacks: number;
  /** Momentum, −100 (away) … +100 (home). */
  momentum: number;
}

export function emptyStats(minute = 0): FixtureStats {
  return {
    minute,
    goals: 0,
    homeGoals: 0,
    awayGoals: 0,
    corners: 0,
    redCards: 0,
    shots: 0,
    shotsOnTarget: 0,
    possessionHome: 50,
    attacks: 0,
    dangerousAttacks: 0,
    momentum: 0,
  };
}

// ── a generated market: a provable predicate + timing + why it fired ──────────

/** What a template declares — the provable predicate + odds + copy. */
export interface Predicate {
  statKey: number;
  threshold: number;
  comparison: Comparison;
  /** Implied `yes` probability → drives odds→points. */
  yesProb: number;
  title: string;
  yesLabel: string;
  noLabel: string;
}

export interface GeneratedMarket {
  /** Plugs straight into the core Room + the on-chain settlement path. */
  spec: MarketSpec;
  templateId: string;
  title: string;
  yesLabel: string;
  noLabel: string;
  /** Human-readable reason the trigger fired (from a context stat). */
  triggerReason: string;
  /** The provable stat this market resolves on. */
  statKey: number;
  openedAtSec: number;
  openedAtMinute: number;
}

// ── templates: trigger (any stat) → provable market ───────────────────────────

/** When a menu market is offered: PRE-MATCH (match-long, locks at kickoff) or a
 *  short LIVE wave. Both settle on a provable stat — the phase only sets timing. */
export type MarketPhase = "pre-match" | "live";

/**
 * The broad market menu. EVERY entry settles on a PROVABLE stat (goals / corners
 * / cards) — non-provable context stats (shots, fouls, possession) are never here,
 * they only DISPLAY. Pre-match markets are the match-long ones; live are the
 * short-window ones the generator opens in waves.
 */
export interface MenuMarket {
  id: string;
  phase: MarketPhase;
  title: string;
  /** The PROVABLE stat this market settles on — always in PROVABLE_STAT_KEYS. */
  statKey: number;
  yesLabel: string;
  noLabel: string;
}

export const MARKET_MENU: MenuMarket[] = [
  // ── pre-match (match-long, lock at kickoff) ────────────────────────────────
  { id: "match-total-goals-ou", phase: "pre-match", title: "Total goals over/under", statKey: STAT_KEY.GOALS, yesLabel: "Over", noLabel: "Under" },
  { id: "match-total-corners-ou", phase: "pre-match", title: "Total corners over/under", statKey: STAT_KEY.CORNERS, yesLabel: "Over", noLabel: "Under" },
  { id: "match-red-card", phase: "pre-match", title: "Red card in the match?", statKey: STAT_KEY.RED_CARDS, yesLabel: "Yes", noLabel: "No" },
  { id: "match-btts", phase: "pre-match", title: "Both teams to score?", statKey: STAT_KEY.GOALS, yesLabel: "Yes", noLabel: "No" },
  { id: "match-next-goal-team", phase: "pre-match", title: "Team to score the next goal", statKey: STAT_KEY.GOALS, yesLabel: "Home", noLabel: "Away" },
  // ── live (short window, opened in waves) ───────────────────────────────────
  { id: "live-goal-10m", phase: "live", title: "Goal in the next 10 minutes?", statKey: STAT_KEY.GOALS, yesLabel: "Goal", noLabel: "No goal" },
  { id: "live-next-goal-team", phase: "live", title: "Who scores the next goal?", statKey: STAT_KEY.GOALS, yesLabel: "Home", noLabel: "Away" },
  { id: "live-next-event-corner", phase: "live", title: "Is the next event a corner?", statKey: STAT_KEY.CORNERS, yesLabel: "Corner", noLabel: "Other" },
  { id: "live-corners-ou", phase: "live", title: "Over/under total corners (live line)", statKey: STAT_KEY.CORNERS, yesLabel: "Over", noLabel: "Under" },
  { id: "live-next-card-team", phase: "live", title: "Which team gets the next card?", statKey: STAT_KEY.RED_CARDS, yesLabel: "Home", noLabel: "Away" },
];

export interface MarketTemplate {
  id: string;
  label: string;
  /** Seconds this template must wait before it can fire again. */
  cooldownSec: number;
  /** How long the market stays live (open → resolve deadline), in seconds. */
  windowSec: number;
  /**
   * Fire? Reads ANY stat (provable or context). Returns a human reason to open,
   * or null to stay quiet. `prev` is the snapshot at the last update (for deltas).
   */
  trigger(now: FixtureStats, prev: FixtureStats): string | null;
  /**
   * Build the PROVABLE predicate for the market. MUST use a provable `statKey`;
   * the generator asserts this and refuses to open a non-provable market.
   */
  predicate(now: FixtureStats): Predicate;
}

// ── the generator ─────────────────────────────────────────────────────────────

export interface GeneratorConfig {
  fixtureId: number;
  /** Commit-reveal window (seconds) after open before the market locks. */
  commitWindowSec: number;
  templates: MarketTemplate[];
}

export const DEFAULT_COMMIT_WINDOW_SEC = 20;

export type GenEventType = "open" | "lock" | "expire";

export interface GenEvent {
  type: GenEventType;
  market: GeneratedMarket;
  atSec: number;
}

/** Internal per-market lifecycle bookkeeping. */
interface Tracked {
  market: GeneratedMarket;
  locked: boolean;
  expired: boolean;
}

/**
 * Assemble a `MarketSpec` from a template's predicate, and ENFORCE provability.
 * Throws if a template ever tries to settle on a non-provable stat — the single
 * guarantee the whole design rests on.
 */
export function buildMarket(
  cfg: GeneratorConfig,
  template: MarketTemplate,
  stats: FixtureStats,
  nowSec: number,
  triggerReason: string,
): GeneratedMarket {
  const p = template.predicate(stats);
  if (!isProvableStat(p.statKey)) {
    throw new Error(
      `template "${template.id}" tried to settle on non-provable stat ${p.statKey} — ` +
        `markets may only resolve on goals/corners/cards`,
    );
  }
  const lockTs = nowSec + cfg.commitWindowSec;
  const resolveDeadlineTs = nowSec + template.windowSec;
  if (!(lockTs < resolveDeadlineTs)) {
    throw new Error(`template "${template.id}": commit window must close before the resolve deadline`);
  }
  const { yesPoints, noPoints } = marketPoints(p.yesProb);
  const spec: MarketSpec = {
    id: `${cfg.fixtureId}-${template.id}-${nowSec}`,
    label: p.title,
    statKey: p.statKey,
    period: 0,
    threshold: p.threshold,
    comparison: p.comparison,
    lockTs,
    resolveDeadlineTs,
    yesPoints,
    noPoints,
  };
  return {
    spec,
    templateId: template.id,
    title: p.title,
    yesLabel: p.yesLabel,
    noLabel: p.noLabel,
    triggerReason,
    statKey: p.statKey,
    openedAtSec: nowSec,
    openedAtMinute: stats.minute,
  };
}

export class MarketGenerator {
  private readonly cfg: GeneratorConfig;
  private prev: FixtureStats;
  private readonly lastFired = new Map<string, number>();
  private readonly tracked: Tracked[] = [];

  constructor(cfg: GeneratorConfig, initial: FixtureStats = emptyStats()) {
    this.cfg = cfg;
    this.prev = initial;
  }

  /**
   * Feed one rolling-stats snapshot at wall-clock `nowSec`. Returns the lifecycle
   * transitions caused: markets that opened (trigger fired), locked (commit window
   * closed), or expired (resolve deadline passed). Deterministic in its inputs.
   */
  update(stats: FixtureStats, nowSec: number): GenEvent[] {
    const events: GenEvent[] = [];

    // 1) Age existing markets: lock at lockTs, expire at resolveDeadlineTs.
    for (const t of this.tracked) {
      if (!t.locked && nowSec >= t.market.spec.lockTs) {
        t.locked = true;
        events.push({ type: "lock", market: t.market, atSec: nowSec });
      }
      if (!t.expired && nowSec >= t.market.spec.resolveDeadlineTs) {
        t.expired = true;
        events.push({ type: "expire", market: t.market, atSec: nowSec });
      }
    }

    // 2) Fire triggers for templates off cooldown with no live instance.
    for (const template of this.cfg.templates) {
      if (this.hasLiveInstance(template.id)) continue;
      const last = this.lastFired.get(template.id);
      if (last !== undefined && nowSec - last < template.cooldownSec) continue;
      const reason = template.trigger(stats, this.prev);
      if (!reason) continue;
      const market = buildMarket(this.cfg, template, stats, nowSec, reason);
      this.tracked.push({ market, locked: false, expired: false });
      this.lastFired.set(template.id, nowSec);
      events.push({ type: "open", market, atSec: nowSec });
    }

    this.prev = stats;
    return events;
  }

  /** A template has a "live" instance if it's opened and not yet expired. */
  private hasLiveInstance(templateId: string): boolean {
    return this.tracked.some((t) => t.market.templateId === templateId && !t.expired);
  }

  /** Markets currently open for commit (opened, not locked, not expired). */
  openForCommit(): GeneratedMarket[] {
    return this.tracked.filter((t) => !t.locked && !t.expired).map((t) => t.market);
  }

  /** Markets that are live (opened, not expired) — locked or not. */
  live(): GeneratedMarket[] {
    return this.tracked.filter((t) => !t.expired).map((t) => t.market);
  }

  /** Every market ever generated (for scoring/receipts/audit). */
  all(): GeneratedMarket[] {
    return this.tracked.map((t) => t.market);
  }
}

// ── the default template registry (trigger → provable predicate) ──────────────

/**
 * The shipped templates. Each pairs a context-stat TRIGGER with a PROVABLE
 * settlement predicate — the mapping the "Report" asks for:
 *
 *   pressure-spike      (dangerous-attacks / momentum)  → "Goal in the next ~10m?" (GOALS)
 *   shots-on-target     (SoT delta)                     → "Goal in the next ~8m?"  (GOALS)
 *   corner-streak       (corners delta)                 → "Over N total corners?"  (CORNERS)
 *   card-tension        (a card + high momentum)        → "Another card shown?"    (RED_CARDS)
 *
 * TRIGGERS read non-provable stats freely; PREDICATES only ever use goals/
 * corners/cards, so every market is settle-ready via `validate_stat`.
 */
export const DEFAULT_TEMPLATES: MarketTemplate[] = [
  {
    id: "pressure-goal",
    label: "Pressure spike → goal",
    cooldownSec: 240,
    windowSec: 600, // ~10 min
    trigger: (now, prev) => {
      const daSpike = now.dangerousAttacks - prev.dangerousAttacks >= 3;
      const highMomentum = Math.abs(now.momentum) >= 60;
      return daSpike || highMomentum
        ? `sustained pressure (+${now.dangerousAttacks - prev.dangerousAttacks} dangerous attacks, momentum ${now.momentum})`
        : null;
    },
    predicate: (now) => ({
      statKey: STAT_KEY.GOALS,
      threshold: now.goals, // yes iff ANY goal lands before the deadline
      comparison: "GreaterThan",
      yesProb: 0.45,
      title: "Goal in the next 10 minutes?",
      yesLabel: "Goal",
      noLabel: "No goal",
    }),
  },
  {
    id: "sot-goal",
    label: "Shots-on-target spike → goal",
    cooldownSec: 180,
    windowSec: 480, // ~8 min
    trigger: (now, prev) =>
      now.shotsOnTarget - prev.shotsOnTarget >= 2
        ? `shots-on-target spike (+${now.shotsOnTarget - prev.shotsOnTarget})`
        : null,
    predicate: (now) => ({
      statKey: STAT_KEY.GOALS,
      threshold: now.goals,
      comparison: "GreaterThan",
      yesProb: 0.5,
      title: "Goal in the next 8 minutes?",
      yesLabel: "Goal",
      noLabel: "No goal",
    }),
  },
  {
    id: "corner-streak",
    label: "Corner streak → over corners",
    cooldownSec: 300,
    windowSec: 900, // ~15 min
    trigger: (now, prev) =>
      now.corners - prev.corners >= 2
        ? `corner streak (+${now.corners - prev.corners} in a burst)`
        : null,
    predicate: (now) => ({
      statKey: STAT_KEY.CORNERS,
      threshold: now.corners + 1, // yes iff at least 2 more corners arrive
      comparison: "GreaterThan",
      yesProb: 0.55,
      title: `Over ${now.corners + 1} total corners?`,
      yesLabel: "Over",
      noLabel: "Under",
    }),
  },
  {
    id: "card-tension",
    label: "Card + tension → another card",
    cooldownSec: 300,
    windowSec: 900, // ~15 min
    trigger: (now, prev) => {
      const cardJustShown = now.redCards - prev.redCards >= 1;
      const tense = Math.abs(now.momentum) >= 40;
      return cardJustShown && tense
        ? `card shown with the game tense (momentum ${now.momentum})`
        : null;
    },
    predicate: (now) => ({
      statKey: STAT_KEY.RED_CARDS,
      threshold: now.redCards, // yes iff another red card is shown
      comparison: "GreaterThan",
      yesProb: 0.3,
      title: "Another red card in the next 15 minutes?",
      yesLabel: "Yes",
      noLabel: "No",
    }),
  },
];
