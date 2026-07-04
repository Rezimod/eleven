import Link from "next/link";
import type { MatchClock, Score } from "@/lib/feed";

const PERIOD_LABEL: Record<MatchClock["period"], string> = {
  PRE: "Pre-match",
  "1H": "1st half",
  HT: "Half time",
  "2H": "2nd half",
  FT: "Full time",
};

export function ScoreHeader({
  home,
  away,
  homeShort,
  awayShort,
  competition,
  score,
  clock,
}: {
  home: string;
  away: string;
  homeShort: string;
  awayShort: string;
  competition: string;
  score: Score;
  clock: MatchClock;
}) {
  const live = clock.running;
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between text-xs text-muted">
        <Link href="/" className="hover:text-text">
          ← Lobby
        </Link>
        <span>{competition}</span>
        <span className={live ? "text-lose" : "text-faint"}>
          {live ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="livedot inline-block h-1.5 w-1.5 rounded-full bg-lose" />
              {clock.minute}&apos;
            </span>
          ) : (
            PERIOD_LABEL[clock.period]
          )}
        </span>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="text-right">
          <div className="font-semibold leading-tight">{home || "Home"}</div>
          <div className="text-xs" style={{ color: "var(--color-home)" }}>
            {homeShort}
          </div>
        </div>
        <div className="num rounded-xl bg-surface2 px-4 py-1.5 text-3xl font-bold">
          {score.home}
          <span className="mx-1.5 text-muted">:</span>
          {score.away}
        </div>
        <div className="text-left">
          <div className="font-semibold leading-tight">{away || "Away"}</div>
          <div className="text-xs" style={{ color: "var(--color-away)" }}>
            {awayShort}
          </div>
        </div>
      </div>
    </div>
  );
}
