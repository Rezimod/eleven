"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMatchRoom } from "@/lib/room/useMatchRoom";
import { useWallet } from "@/lib/wallet/useWallet";
import type { Side } from "@/lib/eleven";
import { Wordmark, LivePill } from "@/components/Brand";
import { ScoreHeader } from "@/components/room/ScoreHeader";
import { PredictionCard } from "@/components/room/PredictionCard";
import { EventTicker } from "@/components/room/EventTicker";
import { Standings } from "@/components/room/PoolPanel";
import { ReceiptCard } from "@/components/room/ReceiptCard";

const mult = (p: number) => (p > 0 ? Math.max(1.05, Math.min(9, 1 / p)) : 1.9);

export function MatchRoom({ fixtureId }: { fixtureId: number }) {
  const room = useMatchRoom(fixtureId);
  const wallet = useWallet();
  const [selected, setSelected] = useState<Side | null>(null);

  // Reset the local pick whenever a fresh round opens.
  const roundIndex = room.round?.index ?? -1;
  useEffect(() => setSelected(null), [roundIndex]);

  const open = room.round?.phase === "open";
  const locked = room.round?.userSide != null;
  const pick = room.round?.userSide ?? selected;

  const homePct = Math.round(room.odds.home * 100);
  const awayPct = 100 - homePct;
  const { homeShort, awayShort, home, away, competition } = room.match;

  const lockPrediction = () => {
    if (open && !locked && selected) room.predict(selected);
  };
  const playUsdc = async () => {
    if (!wallet.connected) await wallet.connect();
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 pb-16 pt-5">
      {/* Top bar */}
      <header className="flex items-center justify-between">
        <Link href="/">
          <Wordmark className="text-xl" />
        </Link>
        <div className="flex items-center gap-2">
          {competition && <span className="hidden text-xs text-faint sm:inline">{competition}</span>}
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

      <PredictionCard
        round={room.round}
        homeShort={homeShort}
        awayShort={awayShort}
        homeName={home}
        awayName={away}
        homePct={homePct}
        awayPct={awayPct}
        homeMult={mult(room.odds.home)}
        awayMult={mult(room.odds.away)}
        selected={pick}
        matchOver={room.matchOver}
        onSelect={setSelected}
      />

      {/* CTA row */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={lockPrediction}
          disabled={!open || locked || !selected}
          className="btn btn-lime flex-1 text-base"
        >
          {locked ? "Prediction locked ✓" : "Lock prediction"}
        </button>
        <button type="button" onClick={playUsdc} className="btn btn-ghost px-5">
          {wallet.connected ? `● ${wallet.address}` : "Play with USDC"}
        </button>
      </div>

      {/* Free chip */}
      <div className="pill w-full justify-center py-2 text-sm text-muted">
        ▶ Playing free · <span className="num text-lime">{room.points.toLocaleString()}</span> pts ·
        no wallet needed
      </div>

      {room.round?.phase === "resolved" && room.round.receipt && (
        <ReceiptCard round={room.round} homeShort={homeShort} awayShort={awayShort} />
      )}

      <EventTicker events={room.events} />
      <Standings standings={room.standings} total={room.odds.total} />
    </main>
  );
}
