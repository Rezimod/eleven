"use client";

import { useEffect, useMemo, useReducer } from "react";

import {
  impliedProbability,
  newPool,
  payout,
  placePrediction,
  predicateOf,
  resolve,
  scoreRound,
  totals,
  validatePrediction,
  type Market,
  type Pool,
  type Side,
  type StreakState,
} from "@/lib/eleven";
import { feedMode, getFeed, type MatchClock, type MatchEvent, type Score } from "@/lib/feed";
import { mockSettleArgs, type SettleArgs } from "@/lib/txline";
import { botPredictions } from "./bots";

const LOCK_WINDOW_MS = 10_000;
const RESOLVE_DELAY_MS = 4_500;
const USER = "You";
const USER_STAKE = 100;
const MAX_TICKER = 40;

type Phase = "open" | "locked" | "resolved";

export interface Round {
  index: number;
  market: Market;
  pool: Pool;
  phase: Phase;
  lockAt: number;
  userSide: Side | null;
  outcome?: boolean; // yes = home scored next
  won?: boolean;
  payout?: number;
  goal?: MatchEvent;
  receipt?: { args: SettleArgs; mock: boolean };
}

interface RoomState {
  fixtureId: number;
  home: string;
  away: string;
  homeShort: string;
  awayShort: string;
  competition: string;
  score: Score;
  clock: MatchClock;
  events: MatchEvent[];
  round: Round | null;
  roundCount: number;
  standings: Record<string, number>;
  streak: StreakState;
  matchOver: boolean;
}

type Action =
  | { type: "INIT"; home: string; away: string; homeShort: string; awayShort: string; competition: string }
  | { type: "KICKOFF"; e: MatchEvent }
  | { type: "TICK"; e: MatchEvent }
  | { type: "TICKER"; e: MatchEvent }
  | { type: "GOAL"; e: MatchEvent }
  | { type: "FULLTIME"; e: MatchEvent }
  | { type: "OPEN_ROUND"; now: number }
  | { type: "LOCK" }
  | { type: "PREDICT"; side: Side; now: number };

function initial(fixtureId: number): RoomState {
  return {
    fixtureId,
    home: "",
    away: "",
    homeShort: "",
    awayShort: "",
    competition: "",
    score: { home: 0, away: 0 },
    clock: { minute: 0, period: "PRE", running: false },
    events: [],
    round: null,
    roundCount: 0,
    standings: {},
    streak: { points: 0, streak: 0 },
    matchOver: false,
  };
}

function nextGoalMarket(s: RoomState, index: number, now: number): Market {
  return {
    id: `${s.fixtureId}-r${index}`,
    fixtureId: s.fixtureId,
    statKey: 1, // goals
    period: 0,
    threshold: s.score.home, // "home goals will exceed the current count" ⇒ home scores next
    comparison: "GreaterThan",
    deadlineTs: now + LOCK_WINDOW_MS,
    homeTeam: s.home,
    awayTeam: s.away,
    label: "Who scores the NEXT goal?",
  };
}

function openRound(s: RoomState, now: number): RoomState {
  if (s.matchOver) return s;
  const index = s.roundCount;
  const market = nextGoalMarket(s, index, now);
  let pool = newPool(market);
  for (const bet of botPredictions(market, now)) pool = placePrediction(pool, bet, now);

  const standings = { ...s.standings };
  if (standings[USER] === undefined) standings[USER] = 0;
  for (const p of pool.predictions) if (standings[p.user] === undefined) standings[p.user] = 0;

  const round: Round = { index, market, pool, phase: "open", lockAt: now + LOCK_WINDOW_MS, userSide: null };
  return { ...s, round, roundCount: index + 1, standings };
}

function pushTicker(s: RoomState, e: MatchEvent): MatchEvent[] {
  return [e, ...s.events].slice(0, MAX_TICKER);
}

function resolveRound(s: RoomState, e: MatchEvent): RoomState {
  const round = s.round;
  if (!round || round.phase === "resolved") return s;

  const outcome = e.team === "home"; // yes = home scored next
  const settledPool = resolve(round.pool, outcome);
  const winningSide: Side = outcome ? "yes" : "no";

  // parimutuel profit → standings (points), additive/positive for winners
  const standings = { ...s.standings };
  for (const p of settledPool.predictions) {
    const prof = Math.max(0, payout(settledPool, p.user) - p.stake);
    standings[p.user] = (standings[p.user] ?? 0) + prof;
  }

  const correct = round.userSide !== null && round.userSide === winningSide;
  const streak = scoreRound(s.streak, correct);
  const bonus = streak.points - s.streak.points; // streak reward
  if (bonus > 0) standings[USER] = (standings[USER] ?? 0) + bonus;

  const userPayout = round.userSide !== null ? payout(settledPool, USER) : 0;

  const resolved: Round = {
    ...round,
    pool: settledPool,
    phase: "resolved",
    outcome,
    won: correct,
    payout: userPayout,
    goal: e,
    receipt: {
      args: mockSettleArgs({
        fixtureId: s.fixtureId,
        targetTs: Math.floor(e.ts / 1000),
        predicate: predicateOf(round.market),
      }),
      mock: feedMode() === "sim",
    },
  };

  return { ...s, score: e.score, clock: e.clock, round: resolved, standings, streak };
}

function reducer(s: RoomState, a: Action): RoomState {
  switch (a.type) {
    case "INIT":
      return { ...s, home: a.home, away: a.away, homeShort: a.homeShort, awayShort: a.awayShort, competition: a.competition };
    case "KICKOFF":
      return openRound({ ...s, score: a.e.score, clock: a.e.clock, events: pushTicker(s, a.e) }, a.e.ts);
    case "TICK":
      return { ...s, score: a.e.score, clock: a.e.clock };
    case "TICKER":
      return { ...s, clock: a.e.clock, events: pushTicker(s, a.e) };
    case "GOAL":
      return resolveRound({ ...s, score: a.e.score, clock: a.e.clock, events: pushTicker(s, a.e) }, a.e);
    case "FULLTIME":
      return { ...s, matchOver: true, clock: a.e.clock, events: pushTicker(s, a.e) };
    case "OPEN_ROUND":
      return openRound(s, a.now);
    case "LOCK":
      return s.round && s.round.phase === "open" ? { ...s, round: { ...s.round, phase: "locked" } } : s;
    case "PREDICT": {
      const r = s.round;
      if (!r || r.phase !== "open" || r.userSide !== null) return s;
      const p = { user: USER, side: a.side, stake: USER_STAKE, placedAt: a.now };
      if (!validatePrediction(r.pool, p, a.now).ok) return s;
      return { ...s, round: { ...r, pool: placePrediction(r.pool, p, a.now), userSide: a.side } };
    }
    default:
      return s;
  }
}

export interface RoomView {
  match: { home: string; away: string; homeShort: string; awayShort: string; competition: string };
  score: Score;
  clock: MatchClock;
  minute: number;
  events: MatchEvent[];
  round: Round | null;
  odds: { home: number; away: number; total: number; homeStake: number; awayStake: number };
  standings: { user: string; points: number; isYou: boolean }[];
  streak: StreakState;
  points: number;
  matchOver: boolean;
  predict: (side: Side) => void;
}

export function useMatchRoom(fixtureId: number): RoomView {
  const [state, dispatch] = useReducer(reducer, fixtureId, initial);

  // Wire the feed → dispatch.
  useEffect(() => {
    const feed = getFeed();
    let alive = true;
    feed.getMatch(fixtureId).then((m) => {
      if (alive && m)
        dispatch({
          type: "INIT",
          home: m.home,
          away: m.away,
          homeShort: m.homeShort,
          awayShort: m.awayShort,
          competition: m.competition,
        });
    });
    const unsub = feed.subscribe(fixtureId, (e) => {
      switch (e.kind) {
        case "kickoff": return dispatch({ type: "KICKOFF", e });
        case "clock": return dispatch({ type: "TICK", e });
        case "goal": return dispatch({ type: "GOAL", e });
        case "corner":
        case "card": return dispatch({ type: "TICKER", e });
        case "fulltime": return dispatch({ type: "FULLTIME", e });
      }
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [fixtureId]);

  // Lock the open round when its window elapses.
  useEffect(() => {
    if (!state.round || state.round.phase !== "open") return;
    const t = setTimeout(() => dispatch({ type: "LOCK" }), Math.max(0, state.round.lockAt - Date.now()));
    return () => clearTimeout(t);
    // Keyed on round identity/phase only — must not re-fire when the pool updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.round?.index, state.round?.phase, state.round?.lockAt]);

  // Open the next round shortly after one resolves.
  useEffect(() => {
    if (!state.round || state.round.phase !== "resolved" || state.matchOver) return;
    const t = setTimeout(() => dispatch({ type: "OPEN_ROUND", now: Date.now() }), RESOLVE_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.round?.index, state.round?.phase, state.matchOver]);

  return useMemo<RoomView>(() => {
    const pool = state.round?.pool ?? null;
    const t = pool ? totals(pool) : { yes: 0, no: 0, total: 0 };
    const standings = Object.entries(state.standings)
      .map(([user, points]) => ({ user, points, isYou: user === USER }))
      .sort((a, b) => b.points - a.points || a.user.localeCompare(b.user));

    return {
      match: {
        home: state.home,
        away: state.away,
        homeShort: state.homeShort,
        awayShort: state.awayShort,
        competition: state.competition,
      },
      score: state.score,
      clock: state.clock,
      minute: state.clock.minute,
      events: state.events,
      round: state.round,
      odds: {
        home: pool ? impliedProbability(pool, "yes") : 0.5,
        away: pool ? impliedProbability(pool, "no") : 0.5,
        total: t.total,
        homeStake: t.yes,
        awayStake: t.no,
      },
      standings,
      streak: state.streak,
      points: state.standings[USER] ?? 0,
      matchOver: state.matchOver,
      predict: (side: Side) => dispatch({ type: "PREDICT", side, now: Date.now() }),
    };
  }, [state]);
}
