"use client";

import { useState } from "react";
import { useMatchRoom } from "@/lib/room/useMatchRoom";
import type { StreakState } from "@/lib/eleven";
import { ScoreHeader } from "@/components/room/ScoreHeader";
import { PredictionCard } from "@/components/room/PredictionCard";
import { EventTicker } from "@/components/room/EventTicker";
import { PoolPanel } from "@/components/room/PoolPanel";
import { ReceiptCard } from "@/components/room/ReceiptCard";
import { ModeToggle, type PlayMode } from "@/components/room/ModeToggle";

function StreakStrip({ streak, points }: { streak: StreakState; points: number }) {
  const mult = streak.streak > 0 ? 1 + 0.25 * (streak.streak - 1) : 1;
  return (
    <div className="card flex items-center justify-between px-4 py-2.5">
      <div className="text-sm">
        <span className="text-muted">Your points </span>
        <span className="num text-base font-bold text-neon">{points.toLocaleString()}</span>
      </div>
      <div className="text-sm">
        {streak.streak > 0 ? (
          <span className="text-gold">
            🔥 {streak.streak} streak · <span className="num">{mult.toFixed(2)}×</span>
          </span>
        ) : (
          <span className="text-faint">no streak yet</span>
        )}
      </div>
    </div>
  );
}

export function MatchRoom({ fixtureId }: { fixtureId: number }) {
  const room = useMatchRoom(fixtureId);
  const [mode, setMode] = useState<PlayMode>("free");

  const homePct = Math.round(room.odds.home * 100);
  const awayPct = 100 - homePct;
  const { homeShort, awayShort } = room.match;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 pb-16 pt-5">
      <ScoreHeader
        home={room.match.home}
        away={room.match.away}
        homeShort={homeShort}
        awayShort={awayShort}
        competition={room.match.competition}
        score={room.score}
        clock={room.clock}
      />

      <StreakStrip streak={room.streak} points={room.points} />
      <ModeToggle mode={mode} onMode={setMode} />

      <PredictionCard
        round={room.round}
        homeShort={homeShort}
        awayShort={awayShort}
        homePct={homePct}
        awayPct={awayPct}
        matchOver={room.matchOver}
        predict={room.predict}
      />

      {room.round?.phase === "resolved" && room.round.receipt && (
        <ReceiptCard round={room.round} homeShort={homeShort} awayShort={awayShort} />
      )}

      <PoolPanel odds={room.odds} standings={room.standings} homeShort={homeShort} awayShort={awayShort} />
      <EventTicker events={room.events} />
    </main>
  );
}
