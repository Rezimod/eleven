"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Wordmark, FeedChip } from "@/components/Brand";
import { MatchCard } from "@/components/MatchCard";
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

  const hero = matches.find((m) => m.status === "live") ?? matches[0];

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-4 pb-16 pt-6">
      <header className="flex items-center justify-between">
        <Wordmark className="text-2xl" />
        <FeedChip mode={mode} />
      </header>

      {/* Hero */}
      <section className="mt-10">
        <h1 className="display text-[52px] leading-[0.92]">
          PREDICT THE
          <br />
          <span className="text-lime">NEXT GOAL</span>
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Live-football micro-markets on Solana. Play free, no wallet — then watch it{" "}
          <span className="text-text">settle on-chain</span> from TxLINE&apos;s signed Merkle
          proof. Trust no oracle.
        </p>

        {hero && (
          <Link href={`/match/${hero.fixtureId}`} className="btn btn-lime mt-6 w-full text-base">
            ▶ Play free — no wallet
          </Link>
        )}
        <p className="mt-2.5 text-center text-xs text-faint">
          Free play uses points. USDC pool is an optional toggle inside a match.
        </p>
      </section>

      {/* Matches */}
      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="eyebrow text-muted">Matches</h2>
          <span className="text-xs text-faint">{matches.length} today</span>
        </div>
        <div className="flex flex-col gap-3">
          {matches.length === 0 ? (
            <div className="card p-6 text-center text-sm text-muted">
              {mode === "live" ? "No live fixtures from TxLINE right now." : "Loading matches…"}
            </div>
          ) : (
            matches.map((m) => <MatchCard key={m.fixtureId} m={m} />)
          )}
        </div>
      </section>

      <footer className="mt-12 border-t border-line pt-4 text-center text-xs text-faint">
        Settled by TxLINE · every payout is a verifiable on-chain receipt
      </footer>
    </main>
  );
}
