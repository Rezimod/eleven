"use client";

import { useState } from "react";

import { STAT_KEY, type GeneratedMarket, type Side } from "@/lib/eleven";

const STAT_NAME: Record<number, string> = {
  [STAT_KEY.GOALS]: "goals",
  [STAT_KEY.CORNERS]: "corners",
  [STAT_KEY.RED_CARDS]: "cards",
};

/**
 * LiveBets — the "live bets" surface. Markets the generator opened from live
 * pressure, appearing and closing on the match clock. Each shows WHY it fired
 * (a context-stat trigger) and WHAT it settles on (always a provable stat), so
 * the trustless-settlement guarantee is visible. Picks here are free-play (local).
 */
function BetCard({ m }: { m: GeneratedMarket }) {
  const [pick, setPick] = useState<Side | null>(null);
  const secsToLock = Math.max(0, Math.ceil((m.spec.lockTs * 1000 - Date.now()) / 1000));

  return (
    <div className="card p-4" style={{ borderColor: "var(--color-lime)" }}>
      <div className="mb-1 flex items-center justify-between">
        <span className="pill pill-lime text-[10px]">LIVE BET</span>
        <span className="text-xs text-muted">
          locks in <span className="num text-lime">{secsToLock}s</span>
        </span>
      </div>
      <h4 className="text-sm font-semibold text-text">{m.title}</h4>
      <p className="mt-1 text-xs text-muted">⚡ {m.triggerReason}</p>
      <p className="mt-0.5 text-[11px] text-faint">
        settles via validate_stat on <span className="text-text">{STAT_NAME[m.statKey] ?? "provable stat"}</span>
      </p>

      <div className="mt-3 flex gap-3">
        {(["yes", "no"] as const).map((side) => {
          const lit = pick === side;
          const label = side === "yes" ? m.yesLabel : m.noLabel;
          const points = side === "yes" ? m.spec.yesPoints : m.spec.noPoints;
          return (
            <button
              key={side}
              type="button"
              onClick={() => setPick(side)}
              className="flex flex-1 flex-col items-center gap-1 rounded-[14px] px-3 py-2.5 transition"
              style={{
                background: lit ? "rgba(198,255,58,0.1)" : "var(--color-panel2)",
                border: `1px solid ${lit ? "var(--color-lime)" : "var(--color-line)"}`,
              }}
            >
              <span className="text-[13px] font-semibold text-text">{label}</span>
              <span className="num text-sm text-lime">+{points} pts</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function LiveBets({ markets }: { markets: GeneratedMarket[] }) {
  if (markets.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="eyebrow text-lime">Live bets</h3>
        <span className="text-xs text-muted">opened by live pressure · settle on proofs</span>
      </div>
      {markets.map((m) => (
        <BetCard key={m.spec.id} m={m} />
      ))}
    </section>
  );
}
