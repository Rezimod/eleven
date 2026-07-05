import Link from "next/link";
import type { MatchSummary } from "@/lib/feed";
import { LivePill, TeamFlag } from "@/components/Brand";

export const TIERS = [
  { key: "free", label: "Free", buyIn: 0 },
  { key: "low", label: "0.05 ◎", buyIn: 50_000_000 },
  { key: "high", label: "0.1 ◎", buyIn: 100_000_000 },
] as const;

/** A fixture card that opens a room at a chosen buy-in tier. */
export function RoomCard({ m }: { m: MatchSummary }) {
  const live = m.status === "live";
  return (
    <div className="card p-4">
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

      <div className="mt-4 flex items-center gap-2">
        <span className="text-xs text-muted">Join a room</span>
        <div className="ml-auto flex gap-2">
          {TIERS.map((t) => (
            <Link
              key={t.key}
              href={`/match/${m.fixtureId}?tier=${t.key}`}
              className={`pill ${t.key === "free" ? "pill-lime" : "text-text"} hover:brightness-110`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
