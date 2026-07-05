"use client";

import { useEffect, useState } from "react";
import { Wordmark, FeedChip } from "@/components/Brand";
import { RoomCard } from "@/components/RoomCard";
import { feedMode, getFeed, type MatchSummary } from "@/lib/feed";

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
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="eyebrow text-muted">Open rooms</h2>
          <span className="text-xs text-faint">{matches.length} fixtures</span>
        </div>
        <div className="flex flex-col gap-3">
          {matches.length === 0 ? (
            <div className="card p-6 text-center text-sm text-muted">
              {mode === "live" ? "No live fixtures from TxLINE right now." : "Loading fixtures…"}
            </div>
          ) : (
            matches.map((m) => <RoomCard key={m.fixtureId} m={m} />)
          )}
        </div>
      </section>

      <footer className="mt-12 border-t border-line pt-4 text-center text-xs text-faint">
        Fixed buy-in · capped rake · winner-takes-pot · every outcome verifiable on-chain
      </footer>
    </main>
  );
}
