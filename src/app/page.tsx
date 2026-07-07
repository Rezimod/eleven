"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Wordmark, FeedChip } from "@/components/Brand";
import { RoomCard } from "@/components/RoomCard";
import { feedMode, getFeed, type MatchSummary } from "@/lib/feed";

function FixtureGroup({ title, tag, matches }: { title: string; tag?: string; matches: MatchSummary[] }) {
  if (matches.length === 0) return null;
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="eyebrow text-muted">{title}</h2>
        {tag ? (
          <span className="pill text-[10px] text-faint">{tag}</span>
        ) : (
          <span className="text-xs text-faint">{matches.length}</span>
        )}
      </div>
      <div className="flex flex-col gap-3">
        {matches.map((m) => (
          <RoomCard key={m.fixtureId} m={m} />
        ))}
      </div>
    </section>
  );
}

/**
 * Quick Play — the one-tap solo entry. Grabs the currently-live fixture and drops
 * you straight into a FREE-PLAY room against 2 bots, live markets already opening.
 * No wallet, no buy-in, no room-picking.
 */
function QuickPlay({ live }: { live: MatchSummary | null }) {
  const router = useRouter();
  const disabled = !live;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => live && router.push(`/match/${live.fixtureId}?tier=free`)}
      className="group mt-6 flex w-full items-center justify-between gap-3 rounded-[16px] px-4 py-3.5 text-left transition active:scale-[0.99] disabled:opacity-50"
      style={{
        background: "var(--color-lime)",
        color: "#0a0d12",
        boxShadow: "0 0 0 1px rgba(198,255,58,0.35), 0 12px 32px -14px rgba(198,255,58,0.7)",
      }}
    >
      <div className="min-w-0">
        <div className="text-[15px] font-bold leading-tight">Quick Play vs 2 bots</div>
        <div className="truncate text-[12px] font-semibold opacity-70">
          {live ? `${live.homeShort} v ${live.awayShort} · live now · free` : "no live match right now"}
        </div>
      </div>
      <span className="shrink-0 rounded-full bg-[#0a0d12] px-3 py-1.5 text-[12px] font-bold text-lime transition group-hover:brightness-110">
        Play ›
      </span>
    </button>
  );
}

export default function Lobby() {
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const mode = feedMode();

  useEffect(() => {
    let alive = true;
    getFeed()
      .listMatches()
      .then((m) => alive && setMatches(m));
    return () => {
      alive = false;
    };
  }, []);

  const liveMatch = matches.find((m) => m.status === "live") ?? null;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-4 pb-16 pt-6">
      <header className="flex items-center justify-between">
        <Wordmark className="text-2xl" />
        <FeedChip mode={mode} />
      </header>

      <section className="mt-10">
        <h1 className="display text-[52px] leading-[0.92]">
          PICK A ROOM
          <br />
          <span className="text-lime">CALL THE GAME</span>
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Fixed buy-in rooms, poker-tournament fair. Predict goals, corners and cards — points come
          only from correct calls, not your stake. Top score takes the pot, settled on-chain from
          TxLINE proofs.
        </p>
        <QuickPlay live={liveMatch} />
      </section>

      {matches.length === 0 ? (
        <section className="mt-8">
          <div className="card p-6 text-center text-sm text-muted">
            {mode === "live" ? "No fixtures from TxLINE right now." : "Loading fixtures…"}
          </div>
        </section>
      ) : (
        <>
          <FixtureGroup title="Live now" tag="LIVE" matches={matches.filter((m) => m.status === "live")} />
          <FixtureGroup title="Upcoming" matches={matches.filter((m) => m.status === "upcoming")} />
          <FixtureGroup
            title="Recent — replay"
            tag="REPLAY"
            matches={matches.filter((m) => m.status === "final")}
          />
        </>
      )}

      <footer className="mt-12 border-t border-line pt-4 text-center text-xs text-faint">
        Fixed buy-in · capped rake · winner-takes-pot · every outcome verifiable on-chain
      </footer>
    </main>
  );
}
