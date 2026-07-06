"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRoom } from "@/lib/room/useRoom";
import { useLiveMarkets } from "@/lib/room/useLiveMarkets";
import { TIERS } from "@/components/RoomCard";
import { Wordmark, LivePill } from "@/components/Brand";
import { ScoreHeader } from "@/components/room/ScoreHeader";
import { PredictionSlip } from "@/components/room/PredictionSlip";
import { StatsBar } from "@/components/room/StatsBar";
import { LiveBets } from "@/components/room/LiveBets";
import { Standings } from "@/components/room/PoolPanel";
import { WinnerBanner } from "@/components/room/WinnerBanner";
import { EventTicker } from "@/components/room/EventTicker";

const RAKE_BPS = 500; // 5%, capped at 10% on-chain

export function MatchRoom({ fixtureId, tier }: { fixtureId: number; tier: string }) {
  const buyIn = (TIERS.find((t) => t.key === tier) ?? TIERS[0]).buyIn;
  const room = useRoom(fixtureId, `${fixtureId}-${tier}`, buyIn, RAKE_BPS);
  const liveMarkets = useLiveMarkets(fixtureId, room.isReplay);

  // Local tick so the commit + live-bet countdowns update without feed events.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (room.phase === "ended") return;
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [room.phase]);

  const { home, away, homeShort, awayShort, competition } = room.match;
  const secsToLock = Math.max(0, Math.ceil((room.lockAt - Date.now()) / 1000));

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 pb-16 pt-5">
      <header className="flex items-center justify-between">
        <Link href="/">
          <Wordmark className="text-xl" />
        </Link>
        <div className="flex items-center gap-2">
          {competition && <span className="hidden text-xs text-faint sm:inline">{competition}</span>}
          {room.isReplay && <span className="pill text-[10px] text-faint">REPLAY</span>}
          {room.clock.running && <LivePill minute={room.clock.minute} />}
        </div>
      </header>

      <ScoreHeader
        home={home}
        away={away}
        homeShort={homeShort}
        awayShort={awayShort}
        competition={competition}
        score={room.score}
        clock={room.clock}
      />

      {/* Room meta */}
      <div className="card flex items-center justify-between p-4 text-sm">
        <div>
          <div className="eyebrow text-muted">Buy-in</div>
          <div className="num text-lg text-text">
            {buyIn === 0 ? "FREE" : `${(buyIn / 1e9).toFixed(2)} ◎`}
          </div>
        </div>
        <div className="text-center">
          <div className="eyebrow text-muted">Players</div>
          <div className="num text-lg text-text">{room.players}</div>
        </div>
        <div className="text-center">
          <div className="eyebrow text-muted">Pot</div>
          <div className="num text-lg text-lime">{buyIn === 0 ? "—" : `${(room.pot / 1e9).toFixed(2)} ◎`}</div>
        </div>
        <div className="text-right">
          <div className="eyebrow text-muted">Your score</div>
          <div className="num text-lg text-lime">{room.yourPoints}</div>
        </div>
      </div>

      {room.phase === "commit" && (
        <div className="pill w-full justify-center py-2 text-sm text-muted">
          Predictions lock in <span className="num text-lime">{secsToLock}s</span> · rake {RAKE_BPS / 100}% (max 10%)
        </div>
      )}

      {room.phase === "ended" && (
        <WinnerBanner winners={room.winners} payouts={room.payouts} buyIn={buyIn} rake={room.rake} />
      )}

      {room.phase !== "ended" && <StatsBar home={homeShort || home} away={awayShort || away} stats={liveMarkets.stats} />}

      {room.phase !== "ended" && <LiveBets markets={liveMarkets.live} />}

      {room.ready && <PredictionSlip markets={room.markets} phase={room.phase} onPredict={room.predict} />}

      <Standings standings={room.standings} pot={room.pot} />
      <EventTicker events={room.events} />
    </main>
  );
}
