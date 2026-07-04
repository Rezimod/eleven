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

export interface MatchFeed {
  readonly kind: "sim" | "live";
  listMatches(): Promise<MatchSummary[]>;
  getMatch(fixtureId: number): Promise<MatchSummary | null>;
  /** Subscribe to a fixture's live events. Returns an unsubscribe fn. */
  subscribe(fixtureId: number, onEvent: (e: MatchEvent) => void): () => void;
}
