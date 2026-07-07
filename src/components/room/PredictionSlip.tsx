"use client";

import type { Side } from "@/lib/eleven";
import type { MarketView } from "@/lib/room/useRoom";
import { MarketRow } from "./MarketRow";
import { ReceiptCard } from "./ReceiptCard";

export function PredictionSlip({
  markets,
  phase,
  lockAt,
  onPredict,
}: {
  markets: MarketView[];
  phase: "commit" | "live" | "ended";
  lockAt: number; // ms
  onPredict: (id: string, side: Side) => void;
}) {
  const canPredict = phase === "commit";
  const secsToLock = Math.max(0, Math.ceil((lockAt - Date.now()) / 1000));

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="eyebrow text-lime">Pre-match</h3>
        <span className="text-[11px] text-muted">
          {canPredict ? "one tap to pick · locks 60s before kickoff" : phase === "live" ? "locked · resolving live" : "full time"}
        </span>
      </div>

      {markets.map((m) => (
        <MarketRow
          key={m.id}
          label={m.label}
          picks={[
            { key: "yes", label: m.yesLabel, points: m.yesPoints },
            { key: "no", label: m.noLabel, points: m.noPoints },
          ]}
          committedKey={m.yourSide}
          locked={!canPredict}
          secsToLock={m.resolved ? undefined : secsToLock}
          resolved={m.resolved}
          outcomeKey={m.resolved ? (m.outcome ? "yes" : "no") : null}
          receipt={
            m.resolved && m.receipt ? (
              <ReceiptCard proof={m.receipt} outcomeText={`${m.outcome ? m.yesLabel : m.noLabel} — ${m.label}`} />
            ) : undefined
          }
          onCommit={(key) => onPredict(m.id, key as Side)}
        />
      ))}
    </section>
  );
}
