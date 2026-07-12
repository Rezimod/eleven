import type { MatchClock, Score } from "@/lib/feed";
import { TeamFlag } from "@/components/Brand";

const PERIOD_LABEL: Record<MatchClock["period"], string> = {
  PRE: "PRE-MATCH",
  "1H": "1ST HALF",
  HT: "HALF TIME",
  "2H": "2ND HALF",
  FT: "FULL TIME",
};

function TeamCol({ short, name, align }: { short: string; name: string; align: "left" | "right" }) {
  return (
    <div className={`flex min-w-0 items-center gap-2 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <TeamFlag short={short} size={24} />
      <span className="truncate text-[13px] font-medium text-muted">{name || short}</span>
    </div>
  );
}

/** Compact match header — score + clock, sized to sit in the sticky top bar. */
export function ScoreHeader({
  home,
  away,
  homeShort,
  awayShort,
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
  const label = PERIOD_LABEL[clock.period];
  const meta = clock.running ? `${label} · ${clock.minute}'` : label;

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      <TeamCol short={homeShort} name={home} align="right" />

      <div className="flex flex-col items-center">
        <div key={`${score.home}-${score.away}`} className="display animate-scorebump text-[30px] leading-none">
          {score.home}
          <span className="mx-1 text-faint">–</span>
          {score.away}
        </div>
        <div className="num mt-0.5 text-center text-[10px] tracking-wide text-lime">{meta}</div>
      </div>

      <TeamCol short={awayShort} name={away} align="left" />
    </div>
  );
}
