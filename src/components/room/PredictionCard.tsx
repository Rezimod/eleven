"use client";

import { useEffect, useState } from "react";
import type { Side } from "@/lib/eleven";
import type { Round } from "@/lib/room/useMatchRoom";
import { TeamFlag } from "@/components/Brand";

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

function PickButton({
  short,
  name,
  mult,
  selected,
  dimmed,
  win,
  disabled,
  onClick,
}: {
  short: string;
  name: string;
  mult: number;
  selected: boolean;
  dimmed: boolean;
  win: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const lit = selected || win;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="relative flex flex-1 flex-col items-center gap-2 rounded-[16px] px-3 py-4 transition"
      style={{
        background: lit ? "rgba(198,255,58,0.1)" : "var(--color-panel2)",
        border: `1px solid ${lit ? "var(--color-lime)" : "var(--color-line)"}`,
        opacity: dimmed ? 0.4 : 1,
        boxShadow: lit ? "0 0 0 1px rgba(198,255,58,0.35), 0 10px 30px -12px rgba(198,255,58,0.6)" : "none",
      }}
    >
      <TeamFlag short={short} size={30} />
      <span className="text-[13px] font-semibold text-text">{name || short}</span>
      <span className="num text-lg text-lime">×{mult.toFixed(1)} pts</span>
      {selected && !win && (
        <span className="eyebrow absolute right-2 top-2 text-lime">picked</span>
      )}
    </button>
  );
}

export function PredictionCard({
  round,
  homeShort,
  awayShort,
  homeName,
  awayName,
  homePct,
  awayPct,
  homeMult,
  awayMult,
  selected,
  matchOver,
  onSelect,
}: {
  round: Round | null;
  homeShort: string;
  awayShort: string;
  homeName: string;
  awayName: string;
  homePct: number;
  awayPct: number;
  homeMult: number;
  awayMult: number;
  selected: Side | null;
  matchOver: boolean;
  onSelect: (side: Side) => void;
}) {
  const open = round?.phase === "open";
  const remaining = useCountdown(round?.lockAt, open);
  const secs = Math.ceil(remaining / 1000);

  if (matchOver && (!round || round.phase === "resolved")) {
    return (
      <div className="card-accent p-6 text-center">
        <div className="display text-2xl">FULL TIME</div>
        <p className="mt-2 text-sm text-muted">Thanks for playing. Check your standings below.</p>
      </div>
    );
  }

  if (!round) {
    return (
      <div className="card-accent p-6 text-center text-sm text-muted">
        Get ready — kick-off imminent…
      </div>
    );
  }

  const resolved = round.phase === "resolved";
  const locked = round.userSide !== null;
  const homeWon = round.outcome === true;
  const awayWon = round.outcome === false;

  return (
    <div className={`card-accent p-5 ${resolved ? "animate-goalflash" : ""}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="eyebrow text-lime">Next goal</div>
          <h3 className="display mt-1 text-[26px]">Who scores next?</h3>
        </div>
        <div className="text-right">
          {open ? (
            <>
              <div className="num text-[20px] text-text">{secs}s</div>
              <div className="eyebrow text-faint">Locks in</div>
            </>
          ) : round.phase === "locked" ? (
            <span className="pill text-muted">LOCKED</span>
          ) : (
            <span className={`pill ${round.won ? "pill-lime" : "text-muted"}`}>
              {round.userSide ? (round.won ? "WON" : "MISSED") : "RESOLVED"}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex gap-3">
        <PickButton
          short={homeShort}
          name={homeName}
          mult={homeMult}
          selected={selected === "yes"}
          dimmed={resolved && !homeWon}
          win={resolved && homeWon}
          disabled={!open || locked}
          onClick={() => onSelect("yes")}
        />
        <PickButton
          short={awayShort}
          name={awayName}
          mult={awayMult}
          selected={selected === "no"}
          dimmed={resolved && !awayWon}
          win={resolved && awayWon}
          disabled={!open || locked}
          onClick={() => onSelect("no")}
        />
      </div>

      {/* pool split bar */}
      <div className="mt-4">
        <div className="flex h-2.5 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.28)" }}>
          <div className="h-full bg-lime" style={{ width: `${homePct}%` }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-muted">
          <span className="text-lime">{homePct}%</span>
          <span>{homePct}% / {awayPct}%</span>
          <span>{awayPct}%</span>
        </div>
      </div>

      {round.phase === "locked" && (
        <p className="mt-3 text-center text-sm text-muted">
          {round.userSide ? "Your pick is in." : "No pick this round."} Next goal decides it…
        </p>
      )}

      {resolved && (
        <div className="mt-4 text-center">
          {round.userSide ? (
            round.won ? (
              <p className="display text-xl text-lime">+{round.payout?.toLocaleString()} PTS</p>
            ) : (
              <p className="text-sm text-red">
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
