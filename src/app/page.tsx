"use client";

import { useEffect, useState } from "react";
import { Wordmark, FeedChip } from "@/components/Brand";
import { RoomCard } from "@/components/RoomCard";
import { WalletChip } from "@/components/WalletChip";
import { feedMode, getFeed, type MatchSummary } from "@/lib/feed";

function FixtureGroup({ title, tag, matches }: { title: string; tag?: string; matches: MatchSummary[] }) {
  if (matches.length === 0) return null;
  return (
    <section className="mt-6">
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

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-4 pb-16 pt-6">
      <header className="flex items-center justify-between">
        <Wordmark className="text-2xl" />
        <div className="flex items-center gap-2">
          <FeedChip mode={mode} />
          <WalletChip />
        </div>
      </header>

      <section className="mt-6">
        <h1 className="display text-[34px] leading-[0.95]">
          PICK A ROOM · <span className="text-lime">CALL THE GAME</span>
        </h1>
      </section>

      {matches.length === 0 ? (
        <section className="mt-6">
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

    </main>
  );
}
