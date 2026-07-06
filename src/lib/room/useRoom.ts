"use client";

import { useEffect, useMemo, useReducer } from "react";

import {
  createRoom,
  joinRoom,
  predict as corePredict,
  resolveMarket,
  settle,
  standings as coreStandings,
  playerPoints,
  marketPoints,
  type Room,
  type MarketSpec,
  type Side,
} from "@/lib/eleven";
import { feedMode, getFeed, type MatchClock, type MatchEvent, type Score } from "@/lib/feed";
import { mockSettleArgs, settleArgsToReceiptProof, type ReceiptProof } from "@/lib/txline";
import { BOTS, botSide } from "./bots";

const YOU = "You";
const LOCK_WINDOW_MS = 12_000; // commit window before predictions lock
const CORNERS_LINE = 6;

/** How a market maps onto the live feed for resolution (UI-only metadata). */
type Resolver =
  | { kind: "nextGoalHome" }
  | { kind: "cornersOver"; line: number }
  | { kind: "redCard" }
  | { kind: "homeOutscore" };

interface MarketDef {
  spec: MarketSpec;
  resolver: Resolver;
  yesLabel: string;
  noLabel: string;
}

function buildMarkets(fixtureId: number, home: string, away: string, lockTs: number, endTs: number): MarketDef[] {
  const m = (
    id: string,
    label: string,
    statKey: number,
    threshold: number,
    yesProb: number,
    resolver: Resolver,
    yesLabel: string,
    noLabel: string,
  ): MarketDef => {
    const { yesPoints, noPoints } = marketPoints(yesProb);
    return {
      spec: {
        id: `${fixtureId}-${id}`,
        label,
        statKey,
        period: 0,
        threshold,
        comparison: "GreaterThan",
        lockTs,
        resolveDeadlineTs: endTs,
        yesPoints,
        noPoints,
      },
      resolver,
      yesLabel,
      noLabel,
    };
  };
  return [
    m("goal", "Next goal is scored by", 1, 0, 0.5, { kind: "nextGoalHome" }, home, away),
    m("corners", `Total corners over ${CORNERS_LINE}`, 6, CORNERS_LINE, 0.52, { kind: "cornersOver", line: CORNERS_LINE }, "Over", "Under"),
    m("red", "A red card is shown", 8, 0, 0.24, { kind: "redCard" }, "Yes", "No"),
    m("outscore", `${home} outscore ${away}`, 1, 0, 0.5, { kind: "homeOutscore" }, home, away),
  ];
}

interface State {
  fixtureId: number;
  roomId: string;
  home: string;
  away: string;
  homeShort: string;
  awayShort: string;
  competition: string;
  status: "live" | "upcoming" | "final";
  score: Score;
  clock: MatchClock;
  events: MatchEvent[];
  lockTs: number; // seconds
  defs: MarketDef[];
  room: Room | null;
  corners: number;
  redSeen: boolean;
  yourPicks: Record<string, Side>;
  ended: boolean;
  ready: boolean;
}

type Action =
  | { type: "INIT"; home: string; away: string; homeShort: string; awayShort: string; competition: string; status: "live" | "upcoming" | "final"; now: number; buyIn: number; rakeBps: number }
  | { type: "PREDICT"; marketId: string; side: Side; now: number }
  | { type: "LOCK_BOTS"; now: number }
  | { type: "EVENT"; e: MatchEvent };

function initial(fixtureId: number, roomId: string): State {
  return {
    fixtureId,
    roomId,
    home: "",
    away: "",
    homeShort: "",
    awayShort: "",
    competition: "",
    status: "live",
    score: { home: 0, away: 0 },
    clock: { minute: 0, period: "PRE", running: false },
    events: [],
    lockTs: 0,
    defs: [],
    room: null,
    corners: 0,
    redSeen: false,
    yourPicks: {},
    ended: false,
    ready: false,
  };
}

/** Resolve a market from the current feed-derived aggregates. */
function resolveOne(room: Room, def: MarketDef, s: State, goalTeam?: "home" | "away"): Room {
  if (room.marketState[def.spec.id]?.resolved) return room;
  let outcome: boolean;
  switch (def.resolver.kind) {
    case "nextGoalHome":
      outcome = goalTeam === "home";
      break;
    case "cornersOver":
      outcome = s.corners > def.resolver.line;
      break;
    case "redCard":
      outcome = s.redSeen;
      break;
    case "homeOutscore":
      outcome = s.score.home > s.score.away;
      break;
  }
  return resolveMarket(room, def.spec.id, outcome);
}

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case "INIT": {
      const lockTs = Math.floor((a.now + LOCK_WINDOW_MS) / 1000);
      const endTs = lockTs + 60 * 60;
      const defs = buildMarkets(state.fixtureId, a.home, a.away, lockTs, endTs);
      let room = createRoom({
        id: state.roomId,
        fixtureId: state.fixtureId,
        creator: YOU,
        buyIn: a.buyIn,
        rakeBps: a.rakeBps,
        maxPlayers: 8,
        joinDeadline: lockTs,
        endTs,
        refundDeadline: endTs + 3600,
        markets: defs.map((d) => d.spec),
      });
      for (const b of BOTS.slice(0, 5)) room = joinRoom(room, b, Math.floor(a.now / 1000));
      return { ...state, home: a.home, away: a.away, homeShort: a.homeShort, awayShort: a.awayShort, competition: a.competition, status: a.status, lockTs, defs, room, ready: true };
    }
    case "PREDICT": {
      if (!state.room || a.now / 1000 >= state.lockTs) return state;
      if (state.yourPicks[a.marketId]) return state;
      let room: Room;
      try {
        room = corePredict(state.room, YOU, a.marketId, a.side, Math.floor(a.now / 1000));
      } catch {
        return state;
      }
      return { ...state, room, yourPicks: { ...state.yourPicks, [a.marketId]: a.side } };
    }
    case "LOCK_BOTS": {
      if (!state.room) return state;
      let room = state.room;
      const t = Math.floor(a.now / 1000) - 1;
      for (const d of state.defs) {
        for (const b of BOTS.slice(0, 5)) {
          try {
            room = corePredict(room, b, d.spec.id, botSide(state.roomId, d.spec.id, b), t);
          } catch {
            /* already predicted */
          }
        }
      }
      return { ...state, room };
    }
    case "EVENT": {
      const e = a.e;
      let s: State = { ...state, clock: e.clock, events: e.kind === "clock" ? state.events : [e, ...state.events].slice(0, 40) };
      if (e.kind === "goal") s = { ...s, score: e.score };
      if (e.kind === "corner") s = { ...s, corners: s.corners + 1 };
      if (e.kind === "card" && e.card === "red") s = { ...s, redSeen: true };
      if (e.kind === "clock" || e.kind === "kickoff") s = { ...s, score: e.score };

      if (!s.room) return s;
      let room = s.room;

      if (e.kind === "goal") {
        const goalDef = s.defs.find((d) => d.resolver.kind === "nextGoalHome" && !room.marketState[d.spec.id]?.resolved);
        if (goalDef) room = resolveOne(room, goalDef, s, e.team === "home" ? "home" : "away");
      }
      if (e.kind === "fulltime") {
        for (const d of s.defs) room = resolveOne(room, d, s);
      }
      return { ...s, room, ended: e.kind === "fulltime" };
    }
    default:
      return state;
  }
}

export interface MarketView {
  id: string;
  label: string;
  yesLabel: string;
  noLabel: string;
  yesPoints: number;
  noPoints: number;
  yourSide: Side | null;
  resolved: boolean;
  outcome?: boolean;
  receipt?: ReceiptProof;
}

export interface RoomView {
  ready: boolean;
  match: { home: string; away: string; homeShort: string; awayShort: string; competition: string };
  status: "live" | "upcoming" | "final";
  isReplay: boolean;
  score: Score;
  clock: MatchClock;
  events: MatchEvent[];
  phase: "commit" | "live" | "ended";
  lockAt: number; // ms
  markets: MarketView[];
  yourPoints: number;
  standings: { player: string; points: number; isYou: boolean }[];
  buyIn: number;
  rakeBps: number;
  players: number;
  pot: number;
  winners: string[];
  payouts: { player: string; amount: number }[];
  rake: number;
  predict: (marketId: string, side: Side) => void;
}

export function useRoom(fixtureId: number, roomId: string, buyIn: number, rakeBps: number): RoomView {
  const [state, dispatch] = useReducer(reducer, undefined, () => initial(fixtureId, roomId));

  useEffect(() => {
    const feed = getFeed();
    let alive = true;
    let unsub = () => {};
    feed.getMatch(fixtureId).then((m) => {
      if (!alive || !m) return;
      dispatch({ type: "INIT", home: m.home, away: m.away, homeShort: m.homeShort, awayShort: m.awayShort, competition: m.competition, status: m.status, now: Date.now(), buyIn, rakeBps });
      // A finished fixture replays from kickoff (REPLAY); a live one tails live.
      unsub = feed.subscribe(fixtureId, (e) => dispatch({ type: "EVENT", e }), { replay: m.status === "final" });
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [fixtureId, buyIn, rakeBps]);

  // Lock bot predictions when the commit window closes.
  useEffect(() => {
    if (!state.ready) return;
    const ms = Math.max(0, state.lockTs * 1000 - Date.now());
    const t = setTimeout(() => dispatch({ type: "LOCK_BOTS", now: Date.now() }), ms);
    return () => clearTimeout(t);
  }, [state.ready, state.lockTs]);

  return useMemo<RoomView>(() => {
    const room = state.room;
    const lockAt = state.lockTs * 1000;
    const phase: RoomView["phase"] = state.ended ? "ended" : Date.now() < lockAt ? "commit" : "live";

    const markets: MarketView[] = state.defs.map((d) => {
      const st = room?.marketState[d.spec.id];
      const resolved = !!st?.resolved;
      let receipt: ReceiptProof | undefined;
      if (resolved) {
        const args = mockSettleArgs({
          fixtureId: state.fixtureId,
          targetTs: Math.floor(Date.now() / 1000),
          predicate: { threshold: d.spec.threshold, comparison: "GreaterThan" },
        });
        receipt = settleArgsToReceiptProof(args, feedMode() === "sim");
      }
      return {
        id: d.spec.id,
        label: d.spec.label,
        yesLabel: d.yesLabel,
        noLabel: d.noLabel,
        yesPoints: d.spec.yesPoints,
        noPoints: d.spec.noPoints,
        yourSide: state.yourPicks[d.spec.id] ?? null,
        resolved,
        outcome: st?.outcome,
        receipt,
      };
    });

    const standings = room
      ? coreStandings(room).map((s) => ({ ...s, isYou: s.player === YOU }))
      : [];
    const result = room && state.ended ? settle(room) : null;

    return {
      ready: state.ready,
      match: { home: state.home, away: state.away, homeShort: state.homeShort, awayShort: state.awayShort, competition: state.competition },
      status: state.status,
      isReplay: feedMode() === "live" && state.status === "final",
      score: state.score,
      clock: state.clock,
      events: state.events,
      phase,
      lockAt,
      markets,
      yourPoints: room ? playerPoints(room, YOU) : 0,
      standings,
      buyIn: state.room?.buyIn ?? buyIn,
      rakeBps: state.room?.rakeBps ?? rakeBps,
      players: room?.players.length ?? 0,
      pot: (state.room?.buyIn ?? buyIn) * (room?.players.length ?? 0),
      winners: result?.winners ?? [],
      payouts: result?.payouts ?? [],
      rake: result?.rake ?? 0,
      predict: (marketId: string, side: Side) => dispatch({ type: "PREDICT", marketId, side, now: Date.now() }),
    };
  }, [state, buyIn, rakeBps]);
}
