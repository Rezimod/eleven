"use client";

import { useEffect, useRef, useState } from "react";

import {
  MarketGenerator,
  DEFAULT_TEMPLATES,
  DEFAULT_COMMIT_WINDOW_SEC,
  emptyStats,
  type FixtureStats,
  type GeneratedMarket,
} from "@/lib/eleven";
import { getFeed, type MatchEvent } from "@/lib/feed";

/**
 * useLiveMarkets — drives the smart market generator off the live feed.
 *
 * Accumulates a fixture's rolling stats (provable counters from event kinds +
 * context stats from `event.stats`) and feeds them to a `MarketGenerator`. The
 * generator opens time-boxed markets on context-stat TRIGGERS; every market it
 * emits settles on a PROVABLE predicate (guaranteed inside the generator).
 *
 * Returns the context stats (DISPLAY-ONLY) and the markets currently open for a
 * commit — so the room can render live bets appearing and closing as play runs.
 */
export interface LiveMarketsView {
  stats: FixtureStats;
  live: GeneratedMarket[];
}

export function useLiveMarkets(fixtureId: number, replay = false): LiveMarketsView {
  const [view, setView] = useState<LiveMarketsView>({ stats: emptyStats(), live: [] });
  const genRef = useRef<MarketGenerator | null>(null);
  const statsRef = useRef<FixtureStats>(emptyStats());

  useEffect(() => {
    genRef.current = new MarketGenerator(
      { fixtureId, commitWindowSec: DEFAULT_COMMIT_WINDOW_SEC, templates: DEFAULT_TEMPLATES },
      emptyStats(),
    );
    statsRef.current = emptyStats();
    setView({ stats: emptyStats(), live: [] });

    const feed = getFeed();
    const onEvent = (e: MatchEvent) => {
      const prev = statsRef.current;
      const s: FixtureStats = {
        ...prev,
        minute: e.minute,
        // provable counters, folded from event kinds + the running score
        homeGoals: e.kind === "goal" || e.kind === "clock" || e.kind === "kickoff" ? e.score.home : prev.homeGoals,
        awayGoals: e.kind === "goal" || e.kind === "clock" || e.kind === "kickoff" ? e.score.away : prev.awayGoals,
        goals: e.score.home + e.score.away,
        corners: prev.corners + (e.kind === "corner" ? 1 : 0),
        redCards: prev.redCards + (e.kind === "card" && e.card === "red" ? 1 : 0),
        // context stats — latest snapshot from the feed (trigger/display only)
        shots: e.stats?.shots ?? prev.shots,
        shotsOnTarget: e.stats?.shotsOnTarget ?? prev.shotsOnTarget,
        possessionHome: e.stats?.possessionHome ?? prev.possessionHome,
        attacks: e.stats?.attacks ?? prev.attacks,
        dangerousAttacks: e.stats?.dangerousAttacks ?? prev.dangerousAttacks,
        momentum: e.stats?.momentum ?? prev.momentum,
      };
      statsRef.current = s;
      genRef.current?.update(s, Math.floor(e.ts / 1000));
      setView({ stats: s, live: genRef.current?.openForCommit() ?? [] });
    };

    const unsub = feed.subscribe(fixtureId, onEvent, { replay });
    return () => unsub();
  }, [fixtureId, replay]);

  return view;
}
