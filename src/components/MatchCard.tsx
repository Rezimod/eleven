import Link from "next/link";
import type { MatchSummary } from "@/lib/feed";

function Crest({ short, tone }: { short: string; tone: "home" | "away" }) {
  return (
    <span
      className="num flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold"
      style={{
        background: tone === "home" ? "color-mix(in oklab, var(--color-home) 20%, transparent)" : "color-mix(in oklab, var(--color-away) 20%, transparent)",
        color: tone === "home" ? "var(--color-home)" : "var(--color-away)",
        border: `1px solid ${tone === "home" ? "var(--color-home)" : "var(--color-away)"}30`,
      }}
    >
      {short}
    </span>
  );
}

export function MatchCard({ m }: { m: MatchSummary }) {
  const live = m.status === "live";
  return (
    <Link
      href={`/match/${m.fixtureId}`}
      className="card group block p-4 transition hover:border-neon/50"
    >
      <div className="mb-3 flex items-center justify-between text-xs text-muted">
        <span>{m.competition}</span>
        <span className={live ? "text-lose" : "text-faint"}>
          {live ? "● LIVE" : m.kickoffLabel}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Crest short={m.homeShort} tone="home" />
          <div className="leading-tight">
            <div className="font-semibold">{m.home}</div>
            <div className="text-xs text-muted">vs {m.away}</div>
          </div>
        </div>
        <Crest short={m.awayShort} tone="away" />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-muted">Predict the next goal</span>
        <span className="btn btn-neon px-4 py-1.5 text-sm group-hover:brightness-105">
          {live ? "Play now" : "Enter"} →
        </span>
      </div>
    </Link>
  );
}
