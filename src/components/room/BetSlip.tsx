"use client";

import { useState } from "react";
import { decimalOdds } from "@/lib/eleven";
import type { LiveMarketView, MarketView } from "@/lib/room/useRoom";

interface SlipEntry {
  id: string;
  market: string;
  pick: string;
  points: number;
  status: "open" | "won" | "missed";
}

function toEntry(m: { id: string; label?: string; title?: string; yesLabel: string; noLabel: string; yesPoints: number; noPoints: number; yourSide: "yes" | "no" | null; resolved: boolean; outcome?: boolean }): SlipEntry | null {
  if (!m.yourSide) return null;
  const won = m.resolved && (m.outcome ? "yes" : "no") === m.yourSide;
  return {
    id: m.id,
    market: m.label ?? m.title ?? "",
    pick: m.yourSide === "yes" ? m.yesLabel : m.noLabel,
    points: m.yourSide === "yes" ? m.yesPoints : m.noPoints,
    status: m.resolved ? (won ? "won" : "missed") : "open",
  };
}

/**
 * BET SLIP — docked at the bottom like a sportsbook. Collapsed: pick count +
 * live totals. Expanded: every pick with its locked odds and outcome. Picks
 * commit per-row (one tap on an odds button); the slip is the running truth
 * of what you're holding.
 */
export function BetSlip({ markets, liveMarkets }: { markets: MarketView[]; liveMarkets: LiveMarketView[] }) {
  const [open, setOpen] = useState(false);
  const entries = [...markets.map(toEntry), ...liveMarkets.map(toEntry)].filter((e): e is SlipEntry => e !== null);
  if (entries.length === 0) return null;

  const pending = entries.filter((e) => e.status === "open");
  const potential = pending.reduce((s, e) => s + e.points, 0);
  const banked = entries.filter((e) => e.status === "won").reduce((s, e) => s + e.points, 0);

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-md px-4 pb-3">
      <div
        className="overflow-hidden rounded-[16px] border border-[rgba(198,255,58,0.4)]"
        style={{ background: "rgba(14,18,24,0.96)", backdropFilter: "blur(14px)", boxShadow: "0 -8px 32px rgba(0,0,0,0.5)" }}
      >
        {open && (
          <ul className="max-h-56 overflow-y-auto border-b border-line px-3 py-2">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 py-1.5 text-[12px]">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-text">{e.pick}</div>
                  <div className="truncate text-[10px] text-faint">{e.market}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="num text-faint">@{decimalOdds(e.points).toFixed(2)}</span>
                  {e.status === "open" && <span className="num text-lime">+{e.points} pts</span>}
                  {e.status === "won" && <span className="pill pill-lime px-2 py-0.5 text-[9px]">WON +{e.points}</span>}
                  {e.status === "missed" && <span className="pill px-2 py-0.5 text-[9px] text-muted">MISSED</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-4 py-3">
          <span className="flex items-center gap-2">
            <span className="pill pill-lime px-2 py-0.5 text-[10px]">BET SLIP</span>
            <span className="text-[13px] font-bold text-text">
              {entries.length} {entries.length === 1 ? "bet" : "bets"}
            </span>
          </span>
          <span className="flex items-center gap-3">
            {banked > 0 && <span className="num text-[12px] text-lime">won +{banked}</span>}
            {potential > 0 && <span className="num text-[12px] text-text">to win +{potential} pts</span>}
            <span className="text-faint">{open ? "▾" : "▴"}</span>
          </span>
        </button>
      </div>
    </div>
  );
}
