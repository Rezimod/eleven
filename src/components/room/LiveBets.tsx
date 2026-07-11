"use client";

import { STAT_KEY, type Side } from "@/lib/eleven";
import type { LiveMarketView } from "@/lib/room/useRoom";
import { MarketRow } from "./MarketRow";

const STAT_NAME: Record<number, string> = {
  [STAT_KEY.GOALS]: "goals",
  [STAT_KEY.CORNERS]: "corners",
  [STAT_KEY.RED_CARDS]: "cards",
};

/**
 * LiveBets — live-wave markets the generator opened from match pressure, as
 * compact one-tap rows sliding in with their own lock countdown. Each row keeps
 * the WHY (trigger) + WHAT-it-settles-on (a provable stat) visible so the
 * trustless-settlement guarantee stays legible. Picks score through the same
 * room engine as pre-match — your score moves the standings live.
 */
function LiveRow({ m, onPredict }: { m: LiveMarketView; onPredict: (id: string, side: Side) => void }) {
  const secsToLock = Math.max(0, Math.ceil((m.lockTs * 1000 - Date.now()) / 1000));
  return (
    <MarketRow
      accent
      label={m.title}
      caption={`⚡ ${m.triggerReason} · settles on ${STAT_NAME[m.statKey] ?? "a provable stat"}`}
      secsToLock={m.resolved ? undefined : secsToLock}
      locked={secsToLock <= 0}
      committedKey={m.yourSide}
      resolved={m.resolved}
      outcomeKey={m.resolved ? (m.outcome ? "yes" : "no") : null}
      picks={[
        { key: "yes", label: m.yesLabel, points: m.yesPoints },
        { key: "no", label: m.noLabel, points: m.noPoints },
      ]}
      onCommit={(key) => onPredict(m.id, key as Side)}
    />
  );
}

export function LiveBets({ markets, onPredict }: { markets: LiveMarketView[]; onPredict: (id: string, side: Side) => void }) {
  if (markets.length === 0) return null;
  // Open/settling markets first, resolved ones sink to the bottom.
  const ordered = [...markets].sort((a, b) => Number(a.resolved) - Number(b.resolved) || b.lockTs - a.lockTs);
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="eyebrow text-lime">Live bets</h3>
        <span className="text-[11px] text-muted">fresh odds as play unfolds</span>
      </div>
      {ordered.map((m) => (
        <LiveRow key={m.id} m={m} onPredict={onPredict} />
      ))}
    </section>
  );
}
