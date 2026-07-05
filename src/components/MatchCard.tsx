import Link from "next/link";
import type { MatchSummary } from "@/lib/feed";
import { LivePill, TeamFlag } from "@/components/Brand";

export function MatchCard({ m }: { m: MatchSummary }) {
  const live = m.status === "live";
  return (
    <Link
      href={`/match/${m.fixtureId}`}
      className="card group block p-4 transition hover:border-[rgba(198,255,58,0.4)]"
    >
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="text-muted">{m.competition}</span>
        {live ? (
          <LivePill minute={m.minute} />
        ) : (
          <span className="pill text-faint">{m.kickoffLabel}</span>
        )}
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

      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-muted">Predict the next goal</span>
        <span className="pill pill-lime group-hover:brightness-110">
          ▶ Play free
        </span>
      </div>
    </Link>
  );
}
