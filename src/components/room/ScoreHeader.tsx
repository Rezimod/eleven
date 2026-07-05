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
    <div className={`flex flex-col items-center gap-2 ${align === "left" ? "sm:items-start" : "sm:items-end"}`}>
      <TeamFlag short={short} size={34} />
      <span className="text-center text-[13px] font-medium text-muted">{name || short}</span>
    </div>
  );
}

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
    <div className="card grid grid-cols-3 items-center gap-2 p-5">
      <TeamCol short={homeShort} name={home} align="right" />

      <div className="flex flex-col items-center">
        <div
          key={`${score.home}-${score.away}`}
          className="display animate-scorebump text-[46px]"
        >
          {score.home}<span className="mx-1.5 text-faint">–</span>{score.away}
        </div>
        <div className="num mt-1 text-center text-[12px] tracking-wide text-lime">{meta}</div>
      </div>

      <TeamCol short={awayShort} name={away} align="left" />
    </div>
  );
}
