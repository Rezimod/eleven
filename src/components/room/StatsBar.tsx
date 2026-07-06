"use client";

import type { FixtureStats } from "@/lib/eleven";

/**
 * Context stats — DISPLAY-ONLY. These drive which live markets open, but no
 * market ever settles on them (only goals/corners/cards are provable). The
 * "display only" label makes that explicit in the UI.
 */
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center">
      <span className="num text-base text-text">{value}</span>
      <span className="eyebrow text-[10px] text-faint">{label}</span>
    </div>
  );
}

export function StatsBar({ home, away, stats }: { home: string; away: string; stats: FixtureStats }) {
  const poss = Math.round(stats.possessionHome);
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="eyebrow text-muted">Live stats</h3>
        <span className="pill text-[10px] text-faint">display only · not settleable</span>
      </div>

      {/* possession bar */}
      <div className="mb-3">
        <div className="mb-1 flex justify-between text-xs text-muted">
          <span>{home} {poss}%</span>
          <span>{100 - poss}% {away}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--color-panel2)" }}>
          <div className="h-full rounded-full bg-lime" style={{ width: `${poss}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-5 gap-1">
        <Stat label="Shots" value={stats.shots} />
        <Stat label="On tgt" value={stats.shotsOnTarget} />
        <Stat label="Attacks" value={stats.attacks} />
        <Stat label="Dang." value={stats.dangerousAttacks} />
        <Stat label="Momentum" value={stats.momentum > 0 ? `+${stats.momentum}` : stats.momentum} />
      </div>
    </div>
  );
}
