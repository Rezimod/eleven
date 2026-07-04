"use client";

import { useEffect, useState } from "react";
import type { Side } from "@/lib/eleven";
import type { Round } from "@/lib/room/useMatchRoom";

function useCountdown(lockAt: number | undefined, active: boolean) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!lockAt || !active) return;
    const tick = () => setRemaining(Math.max(0, lockAt - Date.now()));
    tick();
    const t = setInterval(tick, 100);
    return () => clearInterval(t);
  }, [lockAt, active]);
  return remaining;
}

function SideButton({
  label,
  sub,
  tone,
  picked,
  dimmed,
  win,
  disabled,
  onClick,
}: {
  label: string;
  sub: string;
  tone: "home" | "away";
  picked: boolean;
  dimmed: boolean;
  win: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const color = tone === "home" ? "var(--color-home)" : "var(--color-away)";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="btn relative flex-1 flex-col rounded-xl px-3 py-3 transition disabled:cursor-default"
      style={{
        background: picked || win ? `color-mix(in oklab, ${color} 22%, transparent)` : "var(--color-surface2)",
        border: `1px solid ${picked || win ? color : "var(--color-line)"}`,
        opacity: dimmed ? 0.45 : 1,
        boxShadow: win ? `0 0 0 1px ${color}, 0 10px 30px -12px ${color}` : "none",
      }}
    >
      <span className="font-display text-base font-bold" style={{ color }}>
        {label}
      </span>
      <span className="num mt-0.5 text-xs text-muted">{sub}</span>
      {picked && <span className="mt-1 text-[11px] text-neon">✓ your pick</span>}
    </button>
  );
}

export function PredictionCard({
  round,
  homeShort,
  awayShort,
  homePct,
  awayPct,
  matchOver,
  predict,
}: {
  round: Round | null;
  homeShort: string;
  awayShort: string;
  homePct: number;
  awayPct: number;
  matchOver: boolean;
  predict: (side: Side) => void;
}) {
  const open = round?.phase === "open";
  const remaining = useCountdown(round?.lockAt, open);
  const secs = Math.ceil(remaining / 1000);
  const pct = Math.max(0, Math.min(100, (remaining / 10000) * 100));

  if (matchOver && (!round || round.phase === "resolved")) {
    return (
      <div className="card p-5 text-center">
        <div className="font-display text-lg font-bold">Full time 🏁</div>
        <p className="mt-1 text-sm text-muted">Thanks for playing. Check your standings below.</p>
      </div>
    );
  }

  if (!round) {
    return (
      <div className="card p-5 text-center text-sm text-muted">Get ready — kick-off imminent…</div>
    );
  }

  const resolved = round.phase === "resolved";
  const homeWon = round.outcome === true;
  const awayWon = round.outcome === false;

  return (
    <div className={`card p-4 ${resolved ? "animate-goalflash" : ""}`}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-base font-bold">Who scores the NEXT goal?</h3>
        {open ? (
          <span className="num chip border-neon/40 text-neon">{secs}s</span>
        ) : round.phase === "locked" ? (
          <span className="chip text-cyan border-cyan/40">LOCKED</span>
        ) : (
          <span className={`chip ${round.won ? "text-win border-win/40" : "text-muted"}`}>
            {round.userSide ? (round.won ? "WON" : "MISSED") : "RESOLVED"}
          </span>
        )}
      </div>

      <div className="flex gap-3">
        <SideButton
          label={homeShort}
          sub={`${homePct}% · Home`}
          tone="home"
          picked={round.userSide === "yes"}
          dimmed={resolved && !homeWon}
          win={resolved && homeWon}
          disabled={!open || round.userSide !== null}
          onClick={() => predict("yes")}
        />
        <SideButton
          label={awayShort}
          sub={`${awayPct}% · Away`}
          tone="away"
          picked={round.userSide === "no"}
          dimmed={resolved && !awayWon}
          win={resolved && awayWon}
          disabled={!open || round.userSide !== null}
          onClick={() => predict("no")}
        />
      </div>

      {/* lock countdown */}
      {open && (
        <div className="mt-3">
          <div className="h-1 overflow-hidden rounded-full bg-surface2">
            <div className="h-full bg-neon transition-[width] duration-100" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-center text-xs text-faint">
            {round.userSide ? "Locked in — waiting for the whistle" : "Tap a side before the window closes"}
          </p>
        </div>
      )}

      {round.phase === "locked" && (
        <p className="mt-3 text-center text-sm text-muted">
          {round.userSide ? "Your pick is in." : "No pick this round."} Next goal decides it…
        </p>
      )}

      {resolved && (
        <div className="mt-3 text-center">
          {round.userSide ? (
            round.won ? (
              <p className="font-display text-lg font-bold text-win">
                +{round.payout?.toLocaleString()} pts 🎉
              </p>
            ) : (
              <p className="text-sm text-lose">
                {round.outcome ? homeShort : awayShort} scored — not your pick.
              </p>
            )
          ) : (
            <p className="text-sm text-muted">
              {round.outcome ? homeShort : awayShort} scored the next goal.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
