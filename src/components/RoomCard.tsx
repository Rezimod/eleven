"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MatchSummary } from "@/lib/feed";
import { LivePill, TeamFlag } from "@/components/Brand";

/**
 * PAID ONLY — every tier moves a real (demo devnet SOL under the hood) buy-in
 * into the room escrow PDA on join; the UI shows dollars at the fixed demo
 * rate ($100/SOL → $5 and $10 entries). There is no free entry into a room.
 */
export const TIERS = [
  { key: "low", label: "$5", buyIn: 50_000_000 },
  { key: "high", label: "$10", buyIn: 100_000_000 },
] as const;

/** A fixture card — the WHOLE card opens the room (default entry tier); the
 *  entry chips deep-link a specific stake. */
export function RoomCard({ m }: { m: MatchSummary }) {
  const router = useRouter();
  const live = m.status === "live";
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(`/match/${m.fixtureId}?tier=${TIERS[0].key}`)}
      onKeyDown={(e) => e.key === "Enter" && router.push(`/match/${m.fixtureId}?tier=${TIERS[0].key}`)}
      className="card cursor-pointer p-4 transition hover:brightness-110 active:scale-[0.995]"
    >
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="text-muted">{m.competition}</span>
        {live ? <LivePill minute={m.minute} /> : <span className="pill text-faint">{m.kickoffLabel}</span>}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <TeamFlag short={m.homeShort} size={30} />
          <span className="truncate font-semibold">{m.home}</span>
        </div>
        {live ? (
          <span className="num shrink-0 px-2 text-2xl">
            {m.score.home}<span className="mx-1 text-faint">–</span>{m.score.away}
          </span>
        ) : (
          <span className="shrink-0 text-xs font-semibold text-muted">vs</span>
        )}
        <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
          <span className="truncate text-right font-semibold">{m.away}</span>
          <TeamFlag short={m.awayShort} size={30} />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        {TIERS.map((t) => (
          <Link
            key={t.key}
            href={`/match/${m.fixtureId}?tier=${t.key}`}
            onClick={(e) => e.stopPropagation()}
            className={`pill ${t.key === "low" ? "pill-lime" : "text-text"} hover:brightness-110`}
          >
            Entry {t.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
