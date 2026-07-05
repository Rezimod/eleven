/** Shared types for the ELEVEN settlement keeper. */

export type Comparison = "GreaterThan" | "LessThan" | "EqualTo";

/**
 * A market the keeper watches. Every kind is a MONOTONE provable predicate over
 * a stat TxLINE proves — the moment its condition crosses true it can be proven
 * on-chain (ProveYes); if it never crosses by the deadline it resolves NO by
 * public timeout (TimeoutNo). This maps 1:1 onto `resolve_market`'s two paths.
 */
export type MarketKind = "homeGoalsOver" | "awayGoalsOver" | "cornersOver" | "redCard";

export interface MarketWatch {
  index: number; // market_index on-chain
  kind: MarketKind;
  statKey: number; // TxLINE stat key (goals/corners/cards) used for the live proof fetch
  threshold: number;
  comparison: Comparison;
  label: string;
}

export interface RoomWatch {
  roomId: string; // stable key used for idempotency state
  fixtureId: number;
  endTs: number; // unix seconds; after this, unresolved markets time out and the room settles
  roomPda?: string; // base58 — required only for on-chain broadcast
  treasury?: string;
  markets: MarketWatch[];
}

export interface KeeperConfig {
  feed: "sim" | "live";
  statePath: string;
  /** false → dry-run: decisions are logged, never broadcast. */
  broadcast: boolean;
  simSpeed?: number;
  rpcUrl?: string;
  programId?: string;
  keypairPath?: string;
  oracleProgramId?: string;
  dailyScoresRoots?: string;
  txline?: { origin: string; apiTokenEnv: string };
  rooms: RoomWatch[];
}

export type ResolveKind = "ProveYes" | "TimeoutNo";

export interface Decision {
  room: RoomWatch;
  market: MarketWatch;
  kind: ResolveKind;
  targetTs: number; // event time (unix seconds) proven against
  seq: number; // stream sequence that decided it
}

export type StreamKind = "kickoff" | "clock" | "goal" | "corner" | "card" | "fulltime" | "heartbeat";

/** Normalized event coming off either the sim or the live SSE stream. */
export interface StreamEvent {
  seq: number;
  fixtureId: number;
  kind: StreamKind;
  team?: "home" | "away";
  card?: "yellow" | "red";
  tsSec: number;
}

export interface Action {
  type: "resolve" | "settle";
  roomId: string;
  marketIndex?: number;
  resolveKind?: ResolveKind;
  sig: string;
}
