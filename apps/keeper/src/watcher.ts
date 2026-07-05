import type { MarketWatch, StreamEvent } from "./types.ts";

/** Running tally of the provable stats we care about, per fixture. */
export interface FixtureState {
  homeGoals: number;
  awayGoals: number;
  corners: number;
  reds: number;
  ended: boolean;
}

export function emptyState(): FixtureState {
  return { homeGoals: 0, awayGoals: 0, corners: 0, reds: 0, ended: false };
}

/** Fold a stream event into the fixture tally (pure). */
export function accumulate(s: FixtureState, ev: StreamEvent): FixtureState {
  const next = { ...s };
  switch (ev.kind) {
    case "goal":
      if (ev.team === "home") next.homeGoals += 1;
      else if (ev.team === "away") next.awayGoals += 1;
      break;
    case "corner":
      next.corners += 1;
      break;
    case "card":
      if (ev.card === "red") next.reds += 1;
      break;
    case "fulltime":
      next.ended = true;
      break;
  }
  return next;
}

export function statValue(s: FixtureState, m: MarketWatch): number {
  switch (m.kind) {
    case "homeGoalsOver":
      return s.homeGoals;
    case "awayGoalsOver":
      return s.awayGoals;
    case "cornersOver":
      return s.corners;
    case "redCard":
      return s.reds;
  }
}

/** Is the market's committed predicate provably TRUE given the current tally? */
export function isTrue(s: FixtureState, m: MarketWatch): boolean {
  const v = statValue(s, m);
  switch (m.comparison) {
    case "GreaterThan":
      return v > m.threshold;
    case "LessThan":
      return v < m.threshold;
    case "EqualTo":
      return v === m.threshold;
  }
}
