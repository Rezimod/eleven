/**
 * MatchFeed — the abstraction the whole app is built on.
 *
 * Two implementations live behind it: `SimulatedFeed` (scripted, zero-token, the
 * demo/record path) and `TxlineFeed` (the real SSE `/api/scores/stream`). The UI
 * never knows which one it's talking to. Selected via `NEXT_PUBLIC_FEED`.
 */

export type Team = "home" | "away";

export interface Score {
  home: number;
  away: number;
}

export type Period = "PRE" | "1H" | "HT" | "2H" | "FT";

export interface MatchClock {
  /** Match minute (0–90+). */
  minute: number;
  period: Period;
  running: boolean;
}

export type MatchEventKind = "kickoff" | "clock" | "goal" | "corner" | "card" | "fulltime";

/**
 * Context stats — the live "pressure" signals (shots, possession, momentum …).
 * DISPLAY-ONLY and TRIGGER-ONLY: they can open a market but are NEVER what a
 * market settles on (only goals/corners/cards are provable via `validate_stat`).
 */
export interface MatchStats {
  shots: number;
  shotsOnTarget: number;
  /** Home possession share, 0–100. */
  possessionHome: number;
  attacks: number;
  dangerousAttacks: number;
  /** Momentum, −100 (away) … +100 (home). */
  momentum: number;
}

export interface MatchEvent {
  id: string;
  kind: MatchEventKind;
  /** Client wall-clock ms when emitted. */
  ts: number;
  fixtureId: number;
  minute: number;
  clock: MatchClock;
  score: Score;
  team?: Team;
  card?: "yellow" | "red";
  goalType?: string;
  scorer?: string;
  /** Rolling context stats at this event (present on every event once known). */
  stats?: MatchStats;
}

export interface MatchSummary {
  fixtureId: number;
  competition: string;
  home: string;
  away: string;
  homeShort: string;
  awayShort: string;
  status: "live" | "upcoming" | "final";
  score: Score;
  minute: number;
  kickoffLabel: string;
}

export interface SubscribeOpts {
  /** Replay the fixture from kickoff (for a finished match) rather than live-tail. */
  replay?: boolean;
}

export interface MatchFeed {
  readonly kind: "sim" | "live";
  listMatches(): Promise<MatchSummary[]>;
  getMatch(fixtureId: number): Promise<MatchSummary | null>;
  /** Subscribe to a fixture's live events. Returns an unsubscribe fn. */
  subscribe(fixtureId: number, onEvent: (e: MatchEvent) => void, opts?: SubscribeOpts): () => void;
}
