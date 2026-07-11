"use client";

import { useEffect, useMemo, useReducer } from "react";

import {
  addMarket,
  createRoom,
  predict as corePredict,
  resolveMarket,
  settle,
  standings as coreStandings,
  playerPoints,
  marketPoints,
  MarketGenerator,
  DEFAULT_TEMPLATES,
  DEFAULT_COMMIT_WINDOW_SEC,
  DEFAULT_BASELINE_TEMPLATES,
  DEFAULT_BASELINE_TARGET,
  DEFAULT_BASELINE_LOCK_SEC,
  DEFAULT_BASELINE_WINDOW_SEC,
  emptyStats,
  STAT_KEY,
  type FixtureStats,
  type GeneratedMarket,
  type Room,
  type MarketSpec,
  type Side,
} from "@/lib/eleven";
import { feedMode, getFeed, type MatchClock, type MatchEvent, type Score } from "@/lib/feed";
import { mockSettleArgs, settleArgsToReceiptProof, type ReceiptProof } from "@/lib/txline";

const YOU = "You";
// Pre-match markets lock this many seconds BEFORE the real kickoff — never a fixed
// countdown from when the user entered the room. Sitting in the lobby never locks them.
const PRE_MATCH_LOCK_LEAD_SEC = 60;
const CORNERS_LINE = 6;

/** How a pre-match market maps onto the live feed for resolution (UI-only metadata). */
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

/** Provable-stat value from the rolling fixture stats — the axis a live market settles on. */
function statValue(stats: FixtureStats, statKey: number): number {
  switch (statKey) {
    case STAT_KEY.GOALS:
      return stats.goals;
    case STAT_KEY.CORNERS:
      return stats.corners;
    case STAT_KEY.RED_CARDS:
      return stats.redCards;
    default:
      return 0;
  }
}

/** Fold one feed event into the rolling stats the generator + resolution read. */
function foldStats(prev: FixtureStats, e: MatchEvent): FixtureStats {
  const scored = e.kind === "goal" || e.kind === "clock" || e.kind === "kickoff";
  return {
    ...prev,
    minute: e.minute,
    homeGoals: scored ? e.score.home : prev.homeGoals,
    awayGoals: scored ? e.score.away : prev.awayGoals,
    goals: e.score.home + e.score.away,
    corners: prev.corners + (e.kind === "corner" ? 1 : 0),
    redCards: prev.redCards + (e.kind === "card" && e.card === "red" ? 1 : 0),
    shots: e.stats?.shots ?? prev.shots,
    shotsOnTarget: e.stats?.shotsOnTarget ?? prev.shotsOnTarget,
    possessionHome: e.stats?.possessionHome ?? prev.possessionHome,
    attacks: e.stats?.attacks ?? prev.attacks,
    dangerousAttacks: e.stats?.dangerousAttacks ?? prev.dangerousAttacks,
    momentum: e.stats?.momentum ?? prev.momentum,
  };
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
  kickoffTs: number; // seconds — real kickoff, drives the on-chain join deadline
  defs: MarketDef[];
  liveDefs: GeneratedMarket[]; // live-wave markets added to the room as play unfolds
  stats: FixtureStats;
  room: Room | null;
  yourPicks: Record<string, Side>;
  ended: boolean;
  ready: boolean;
}

type Action =
  | { type: "INIT"; home: string; away: string; homeShort: string; awayShort: string; competition: string; status: "live" | "upcoming" | "final"; now: number; kickoffTs: number; buyIn: number; rakeBps: number }
  | { type: "PREDICT"; marketId: string; side: Side; now: number }
  | { type: "EVENT"; e: MatchEvent; stats: FixtureStats; opened: GeneratedMarket[]; nowSec: number };

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
    kickoffTs: 0,
    defs: [],
    liveDefs: [],
    stats: emptyStats(),
    room: null,
    yourPicks: {},
    ended: false,
    ready: false,
  };
}

/** Resolve a pre-match market from the current feed-derived stats. */
function resolvePreMatch(room: Room, def: MarketDef, s: State, goalTeam?: "home" | "away"): Room {
  if (room.marketState[def.spec.id]?.resolved) return room;
  let outcome: boolean;
  switch (def.resolver.kind) {
    case "nextGoalHome":
      outcome = goalTeam === "home";
      break;
    case "cornersOver":
      outcome = s.stats.corners > def.resolver.line;
      break;
    case "redCard":
      outcome = s.stats.redCards > 0;
      break;
    case "homeOutscore":
      outcome = s.score.home > s.score.away;
      break;
  }
  return resolveMarket(room, def.spec.id, outcome);
}

/**
 * Resolve every open live-wave market from the rolling stats. A live market settles
 * `yes` the instant its provable stat crosses the frozen threshold; `no` once its
 * resolve deadline passes (or at full time) without crossing. Monotone predicates,
 * the same shape the on-chain keeper resolves.
 */
function resolveLive(room: Room, liveDefs: GeneratedMarket[], stats: FixtureStats, nowSec: number, fulltime: boolean): Room {
  let r = room;
  for (const gm of liveDefs) {
    if (r.marketState[gm.spec.id]?.resolved) continue;
    if (statValue(stats, gm.spec.statKey) > gm.spec.threshold) {
      r = resolveMarket(r, gm.spec.id, true);
    } else if (fulltime || nowSec >= gm.spec.resolveDeadlineTs) {
      r = resolveMarket(r, gm.spec.id, false);
    }
  }
  return r;
}

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case "INIT": {
      const kickoffSec = Math.floor(a.kickoffTs / 1000);
      // Pre-match markets lock 60s BEFORE the real kickoff, derived from the fixture's
      // kickoff time — so they stay open however long the user waits pre-kickoff, and
      // a joiner arriving after kickoff finds them already locked (live markets take over).
      const lockTs = kickoffSec - PRE_MATCH_LOCK_LEAD_SEC;
      const endTs = kickoffSec + 60 * 60;
      const defs = buildMarkets(state.fixtureId, a.home, a.away, lockTs, endTs);
      // The local room mirrors YOUR scoring only — real opponents pay their
      // buy-in on-chain (join_room) and their sealed picks live in their own
      // commit-reveal PDAs, invisible here until reveal. No free/bot entries.
      const room = createRoom({
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
      return { ...state, home: a.home, away: a.away, homeShort: a.homeShort, awayShort: a.awayShort, competition: a.competition, status: a.status, lockTs, kickoffTs: kickoffSec, defs, room, ready: true };
    }
    case "PREDICT": {
      if (!state.room) return state;
      const market = state.room.markets.find((m) => m.id === a.marketId);
      if (!market) return state;
      const nowSec = Math.floor(a.now / 1000);
      if (nowSec >= market.lockTs) return state; // respect this market's lock window
      if (state.yourPicks[a.marketId]) return state;
      let room: Room;
      try {
        room = corePredict(state.room, YOU, a.marketId, a.side, nowSec);
      } catch {
        return state;
      }
      return { ...state, room, yourPicks: { ...state.yourPicks, [a.marketId]: a.side } };
    }
    case "EVENT": {
      const e = a.e;
      const fulltime = e.kind === "fulltime";
      let s: State = {
        ...state,
        stats: a.stats,
        clock: e.clock,
        events: e.kind === "clock" ? state.events : [e, ...state.events].slice(0, 40),
      };
      if (e.kind === "goal" || e.kind === "clock" || e.kind === "kickoff") s = { ...s, score: e.score };

      if (!s.room) return s;
      let room = s.room;

      // 1) Newly-opened live markets: add to the room.
      let liveDefs = s.liveDefs;
      if (a.opened.length) {
        liveDefs = [...liveDefs];
        for (const gm of a.opened) {
          room = addMarket(room, gm.spec);
          liveDefs.push(gm);
        }
      }

      // 2) Resolve markets from the stats this event produced.
      if (e.kind === "goal") {
        const goalDef = s.defs.find((d) => d.resolver.kind === "nextGoalHome" && !room.marketState[d.spec.id]?.resolved);
        if (goalDef) room = resolvePreMatch(room, goalDef, s, e.team === "home" ? "home" : "away");
      }
      if (fulltime) {
        for (const d of s.defs) room = resolvePreMatch(room, d, s);
      }
      room = resolveLive(room, liveDefs, a.stats, a.nowSec, fulltime);

      return { ...s, room, liveDefs, ended: fulltime };
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

export interface LiveMarketView {
  id: string;
  title: string;
  yesLabel: string;
  noLabel: string;
  yesPoints: number;
  noPoints: number;
  triggerReason: string;
  statKey: number;
  lockTs: number; // seconds
  yourSide: Side | null;
  resolved: boolean;
  outcome?: boolean;
}

export interface StandingView {
  player: string;
  points: number;
  isYou: boolean;
  isBot: boolean;
}

export interface RoomView {
  ready: boolean;
  match: { home: string; away: string; homeShort: string; awayShort: string; competition: string };
  status: "live" | "upcoming" | "final";
  isReplay: boolean;
  score: Score;
  clock: MatchClock;
  events: MatchEvent[];
  stats: FixtureStats;
  phase: "commit" | "live" | "ended";
  lockAt: number; // ms
  kickoffAt: number; // ms — real kickoff; on-chain joins close here
  markets: MarketView[];
  liveMarkets: LiveMarketView[];
  yourPoints: number;
  standings: StandingView[];
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
    const gen = new MarketGenerator(
      {
        fixtureId,
        commitWindowSec: DEFAULT_COMMIT_WINDOW_SEC,
        templates: DEFAULT_TEMPLATES,
        // Always-on rolling baseline: live play is never left with zero open markets.
        baseline: {
          templates: DEFAULT_BASELINE_TEMPLATES,
          target: DEFAULT_BASELINE_TARGET,
          lockSec: DEFAULT_BASELINE_LOCK_SEC,
          windowSec: DEFAULT_BASELINE_WINDOW_SEC,
        },
      },
      emptyStats(),
    );
    let stats = emptyStats();

    feed.getMatch(fixtureId).then((m) => {
      if (!alive || !m) return;
      dispatch({ type: "INIT", home: m.home, away: m.away, homeShort: m.homeShort, awayShort: m.awayShort, competition: m.competition, status: m.status, now: Date.now(), kickoffTs: m.kickoffTs, buyIn, rakeBps });
      // A finished fixture replays from kickoff (REPLAY); a live one tails live.
      unsub = feed.subscribe(
        fixtureId,
        (e) => {
          stats = foldStats(stats, e);
          const nowSec = Math.floor(e.ts / 1000);
          const opened = gen.update(stats, nowSec).filter((g) => g.type === "open").map((g) => g.market);
          dispatch({ type: "EVENT", e, stats, opened, nowSec });
        },
        { replay: m.status === "final" },
      );
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [fixtureId, buyIn, rakeBps]);

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

    // Show every still-open live market, plus only the few most-recent resolved
    // ones — the rolling baseline would otherwise pile up hundreds over a match.
    const RESOLVED_LIVE_SHOWN = 4;
    const openLive = state.liveDefs.filter((gm) => !room?.marketState[gm.spec.id]?.resolved);
    const resolvedLive = state.liveDefs.filter((gm) => room?.marketState[gm.spec.id]?.resolved).slice(-RESOLVED_LIVE_SHOWN);
    const liveMarkets: LiveMarketView[] = [...openLive, ...resolvedLive].map((gm) => {
      const st = room?.marketState[gm.spec.id];
      return {
        id: gm.spec.id,
        title: gm.title,
        yesLabel: gm.yesLabel,
        noLabel: gm.noLabel,
        yesPoints: gm.spec.yesPoints,
        noPoints: gm.spec.noPoints,
        triggerReason: gm.triggerReason,
        statKey: gm.statKey,
        lockTs: gm.spec.lockTs,
        yourSide: state.yourPicks[gm.spec.id] ?? null,
        resolved: !!st?.resolved,
        outcome: st?.outcome,
      };
    });

    const standings: StandingView[] = room
      ? coreStandings(room).map((s) => ({ ...s, isYou: s.player === YOU, isBot: false }))
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
      stats: state.stats,
      phase,
      lockAt,
      kickoffAt: state.kickoffTs * 1000,
      markets,
      liveMarkets,
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
