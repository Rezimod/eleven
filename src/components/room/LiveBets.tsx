"use client";

import { STAT_KEY, type GeneratedMarket } from "@/lib/eleven";
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
 * trustless-settlement guarantee stays legible. Picks here are free-play (local).
 */
function LiveRow({ m }: { m: GeneratedMarket }) {
  const secsToLock = Math.max(0, Math.ceil((m.spec.lockTs * 1000 - Date.now()) / 1000));
  return (
    <MarketRow
      accent
      label={m.title}
      caption={`⚡ ${m.triggerReason} · settles on ${STAT_NAME[m.statKey] ?? "a provable stat"}`}
      secsToLock={secsToLock}
      locked={secsToLock <= 0}
      picks={[
        { key: "yes", label: m.yesLabel, points: m.spec.yesPoints },
        { key: "no", label: m.noLabel, points: m.spec.noPoints },
      ]}
    />
  );
}

export function LiveBets({ markets }: { markets: GeneratedMarket[] }) {
  if (markets.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="eyebrow text-lime">Live waves</h3>
        <span className="text-[11px] text-muted">opened by pressure · settle on proofs</span>
      </div>
      {markets.map((m) => (
        <LiveRow key={m.spec.id} m={m} />
      ))}
    </section>
  );
}
