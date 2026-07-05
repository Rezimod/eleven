"use client";

import type { Side } from "@/lib/eleven";
import type { MarketView } from "@/lib/room/useRoom";
import { ReceiptCard } from "./ReceiptCard";

function PickButton({
  label,
  points,
  picked,
  win,
  dimmed,
  disabled,
  onClick,
}: {
  label: string;
  points: number;
  picked: boolean;
  win: boolean;
  dimmed: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const lit = picked || win;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-1 flex-col items-center gap-1 rounded-[14px] px-3 py-2.5 transition"
      style={{
        background: lit ? "rgba(198,255,58,0.1)" : "var(--color-panel2)",
        border: `1px solid ${lit ? "var(--color-lime)" : "var(--color-line)"}`,
        opacity: dimmed ? 0.4 : 1,
        boxShadow: lit ? "0 0 0 1px rgba(198,255,58,0.3)" : "none",
      }}
    >
      <span className="text-[13px] font-semibold text-text">{label}</span>
      <span className="num text-sm text-lime">+{points} pts</span>
    </button>
  );
}

function MarketRow({ m, canPredict, onPredict }: { m: MarketView; canPredict: boolean; onPredict: (id: string, s: Side) => void }) {
  const yesWon = m.resolved && m.outcome === true;
  const noWon = m.resolved && m.outcome === false;
  const youWon = m.resolved && ((m.yourSide === "yes" && yesWon) || (m.yourSide === "no" && noWon));
  const winnerLabel = m.outcome ? m.yesLabel : m.noLabel;

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-text">{m.label}</h4>
        {m.resolved ? (
          <span className={`pill ${youWon ? "pill-lime" : "text-muted"}`}>
            {m.yourSide ? (youWon ? "WON" : "MISSED") : "RESOLVED"}
          </span>
        ) : m.yourSide ? (
          <span className="pill pill-lime">PICKED</span>
        ) : (
          <span className="pill text-faint">OPEN</span>
        )}
      </div>

      <div className="flex gap-3">
        <PickButton
          label={m.yesLabel}
          points={m.yesPoints}
          picked={m.yourSide === "yes"}
          win={yesWon}
          dimmed={m.resolved && !yesWon}
          disabled={!canPredict || !!m.yourSide || m.resolved}
          onClick={() => onPredict(m.id, "yes")}
        />
        <PickButton
          label={m.noLabel}
          points={m.noPoints}
          picked={m.yourSide === "no"}
          win={noWon}
          dimmed={m.resolved && !noWon}
          disabled={!canPredict || !!m.yourSide || m.resolved}
          onClick={() => onPredict(m.id, "no")}
        />
      </div>

      {m.resolved && m.receipt && (
        <div className="mt-3">
          <ReceiptCard proof={m.receipt} outcomeText={`${winnerLabel} — ${m.label}`} />
        </div>
      )}
    </div>
  );
}

export function PredictionSlip({
  markets,
  phase,
  onPredict,
}: {
  markets: MarketView[];
  phase: "commit" | "live" | "ended";
  onPredict: (id: string, side: Side) => void;
}) {
  const canPredict = phase === "commit";
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="eyebrow text-lime">Prediction slip</h3>
        <span className="text-xs text-muted">
          {canPredict ? "Lock your picks before kickoff" : phase === "live" ? "Locked · resolving live" : "Full time"}
        </span>
      </div>
      {markets.map((m) => (
        <MarketRow key={m.id} m={m} canPredict={canPredict} onPredict={onPredict} />
      ))}
    </section>
  );
}
