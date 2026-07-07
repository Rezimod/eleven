"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRoom } from "@/lib/room/useRoom";
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

/** Copy this room's deep link — the match room is fully addressable by its URL. */
function ShareButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window === "undefined") return;
        navigator.clipboard?.writeText(window.location.href).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          },
          () => {},
        );
      }}
      className="pill px-2 py-0.5 text-[10px] text-faint hover:text-text"
    >
      {copied ? "copied ✓" : "share"}
    </button>
  );
}

function MetaStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="eyebrow text-[9px] text-faint">{label}</span>
      <span className={`num text-sm leading-none ${accent ? "text-lime" : "text-text"}`}>{value}</span>
    </div>
  );
}

export function MatchRoom({ fixtureId, tier }: { fixtureId: number; tier: string }) {
  const buyIn = (TIERS.find((t) => t.key === tier) ?? TIERS[0]).buyIn;
  const room = useRoom(fixtureId, `${fixtureId}-${tier}`, buyIn, RAKE_BPS);

  // Local tick so the per-row lock countdowns update without feed events.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (room.phase === "ended") return;
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [room.phase]);

  const { home, away, homeShort, awayShort, competition } = room.match;
  // Room state machine: Lobby (pre-match) → Live → FullTime.
  const gamePhase = room.phase === "ended" ? "fulltime" : room.phase === "commit" ? "lobby" : "live";
  const free = buyIn === 0;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-16">
      {/* ── sticky compact header: score + clock + phase ─────────────────── */}
      <div
        className="sticky top-0 z-20 -mx-4 mb-3 border-b border-line px-4 pb-3 pt-4"
        style={{ background: "rgba(10,13,18,0.82)", backdropFilter: "blur(12px)" }}
      >
        <header className="mb-2.5 flex items-center justify-between">
          <Link href="/">
            <Wordmark className="text-lg" />
          </Link>
          <div className="flex items-center gap-2">
            {competition && <span className="hidden text-[11px] text-faint sm:inline">{competition}</span>}
            {room.isReplay && <span className="pill px-2 py-0.5 text-[10px] text-faint">REPLAY</span>}
            {room.clock.running && <LivePill minute={room.clock.minute} />}
            <ShareButton />
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

        {/* phase strip */}
        <div className="mt-2.5 flex items-center gap-1.5 text-[10px]">
          {(["lobby", "live", "fulltime"] as const).map((p, i) => {
            const active = p === gamePhase;
            const label = p === "lobby" ? "LOBBY" : p === "live" ? "LIVE" : "FULL TIME";
            return (
              <div key={p} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-faint">→</span>}
                <span className={`pill px-2 py-0.5 ${active ? "pill-lime" : "text-faint"}`}>{label}</span>
              </div>
            );
          })}
          <span className="ml-auto text-faint">
            {gamePhase === "lobby" ? "pre-match bets" : gamePhase === "live" ? "live waves" : "settling"}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {/* slim standings strip (pot lives here) */}
        <Standings standings={room.standings} pot={room.pot} />

        {/* slim meta line */}
        <div className="card flex items-center justify-between gap-2 px-3 py-2">
          <MetaStat label="Buy-in" value={free ? "FREE" : `${(buyIn / 1e9).toFixed(2)} ◎`} />
          <div className="h-6 w-px bg-line" />
          <MetaStat label="Players" value={String(room.players)} />
          <div className="h-6 w-px bg-line" />
          <MetaStat label="Your score" value={String(room.yourPoints)} accent />
          <div className="h-6 w-px bg-line" />
          <MetaStat label="Rake" value={`${RAKE_BPS / 100}%`} />
        </div>

        {room.phase === "ended" && (
          <WinnerBanner winners={room.winners} payouts={room.payouts} buyIn={buyIn} rake={room.rake} />
        )}

        {/* pre-match markets — compact rows (resolved rows keep their receipts) */}
        {room.ready && (
          <PredictionSlip markets={room.markets} phase={room.phase} lockAt={room.lockAt} onPredict={room.predict} />
        )}

        {/* live-wave markets — one-tap free-play picks; you + bots score live */}
        {room.phase !== "ended" && <LiveBets markets={room.liveMarkets} onPredict={room.predict} />}

        {/* context stats — display only, below the actionable markets */}
        {room.phase !== "ended" && <StatsBar home={homeShort || home} away={awayShort || away} stats={room.stats} />}

        <EventTicker events={room.events} />
      </div>
    </main>
  );
}
