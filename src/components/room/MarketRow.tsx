"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { decimalOdds } from "@/lib/eleven";

const GRACE_MS = 3_000; // "tap to undo" window before a pick commits

/** Sportsbook decimal odds for a points value — "2.00", "1.52". */
const fmtOdds = (points: number) => decimalOdds(points).toFixed(2);

export interface RowPick {
  key: string;
  label: string;
  points: number;
}

export interface MarketRowProps {
  label: string;
  picks: RowPick[]; // 2 or 3 equal-width chips
  /** Committed pick from the parent/hook truth (e.g. pre-match yourSide). */
  committedKey?: string | null;
  /** Market locked → chips disabled, no new taps accepted. */
  locked?: boolean;
  /** Seconds until this market locks (drives the countdown chip). */
  secsToLock?: number;
  /** Tiny caption under the label (e.g. a live trigger / settlement note). */
  caption?: ReactNode;
  accent?: boolean;
  // resolved display (pre-match markets that have settled)
  resolved?: boolean;
  outcomeKey?: string | null;
  receipt?: ReactNode;
  /** Commit the pick to the hook. Fired once, AFTER the undo grace elapses. */
  onCommit?: (key: string) => void;
}

function haptic() {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) navigator.vibrate(8);
  }
}

/** Compact real countdown — `Ns`, `Nm Ss`, or `Nh Nm` so a lock hours out stays legible. */
function fmtCountdown(secs: number): string {
  if (secs >= 3600) return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
  if (secs >= 60) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `${secs}s`;
}

function LockChip({ secs }: { secs: number }) {
  const urgent = secs <= 5;
  return (
    <span className={`pill shrink-0 px-2 py-0.5 text-[10px] ${urgent ? "pill-live" : "text-faint"}`}>
      {secs > 0 ? (
        <>
          locks in <span className="num">{fmtCountdown(secs)}</span>
        </>
      ) : (
        "awaiting result"
      )}
    </span>
  );
}

/**
 * MarketRow — one compact (~64–80px) betting row. Presentation only: it owns the
 * one-tap → 3s undo → commit lifecycle locally and calls `onCommit` exactly once
 * when the grace elapses. All settlement/points data comes in via props.
 */
export function MarketRow({
  label,
  picks,
  committedKey = null,
  locked = false,
  secsToLock,
  caption,
  accent = false,
  resolved = false,
  outcomeKey = null,
  receipt,
  onCommit,
}: MarketRowProps) {
  const [pending, setPending] = useState<string | null>(null);
  const [localCommitted, setLocalCommitted] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const committed = committedKey ?? localCommitted;

  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  const commit = (key: string) => {
    clear();
    setPending(null);
    setLocalCommitted(key);
    onCommit?.(key);
  };

  // Flush an in-flight pick the instant the market locks — a tap made just before
  // kickoff still lands, and nothing can be tapped afterwards.
  useEffect(() => {
    if (locked && pending) commit(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, pending]);

  useEffect(() => clear, []);

  const tap = (key: string) => {
    if (locked || resolved || committed || pending) return; // guard double-submit / post-lock
    haptic();
    setPending(key);
    clear();
    timer.current = setTimeout(() => commit(key), GRACE_MS);
  };

  const base = accent
    ? "border-[rgba(198,255,58,0.4)] bg-[rgba(198,255,58,0.04)]"
    : "border-line bg-panel";

  // ── resolved: slim settled row + optional receipt ──────────────────────────
  if (resolved) {
    const picked = committed;
    const won = picked != null && picked === outcomeKey;
    const winner = picks.find((p) => p.key === outcomeKey);
    return (
      <div className={`rounded-[14px] border ${base}`}>
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-text">{label}</div>
            <div className="text-[11px] text-faint">
              won: <span className="text-text">{winner?.label ?? "—"}</span>
            </div>
          </div>
          <span className={`pill shrink-0 ${won ? "pill-lime" : picked ? "text-muted" : "text-faint"}`}>
            {picked ? (won ? "WON" : "MISSED") : "RESOLVED"}
          </span>
        </div>
        {receipt && <div className="px-3 pb-3">{receipt}</div>}
      </div>
    );
  }

  // ── committed: collapse to a slim "✓ in" row ───────────────────────────────
  if (committed) {
    const p = picks.find((x) => x.key === committed);
    return (
      <div className={`animate-popin flex items-center justify-between gap-2 rounded-[14px] border px-3 py-2.5 ${base}`}>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-text">{label}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[13px] text-muted">{p?.label}</span>
          {p && <span className="num text-[12px] text-faint">@{fmtOdds(p.points)}</span>}
          {p && <span className="num text-sm text-lime">+{p.points} pts</span>}
          <span className="pill pill-lime px-2 py-0.5 text-[10px]">✓ in</span>
        </div>
      </div>
    );
  }

  // ── pending: filled, "tap to undo" for 3s ──────────────────────────────────
  if (pending) {
    const p = picks.find((x) => x.key === pending)!;
    return (
      <div className={`animate-tappop overflow-hidden rounded-[14px] border ${base}`}>
        <div className="flex items-center justify-between gap-2 px-3 pt-2">
          <div className="truncate text-[13px] font-semibold text-text">{label}</div>
          <span className="text-[10px] text-faint">tap to undo</span>
        </div>
        <button
          type="button"
          onClick={() => {
            clear();
            setPending(null);
          }}
          className="mt-2 flex w-full items-center justify-center gap-2 px-3"
          style={{ minHeight: 44 }}
        >
          <span
            className="flex w-full items-center justify-center gap-2 rounded-[12px] px-3"
            style={{
              minHeight: 40,
              background: "var(--color-lime)",
              color: "#0a0d12",
              boxShadow: "0 0 0 1px rgba(198,255,58,0.35), 0 8px 24px -12px rgba(198,255,58,0.6)",
            }}
          >
            <span className="text-[13px] font-bold">{p.label}</span>
            <span className="num text-[12px] opacity-70">@{fmtOdds(p.points)}</span>
            <span className="num text-sm">+{p.points} pts</span>
            <span className="text-[11px] font-semibold opacity-70">· undo</span>
          </span>
        </button>
        <div className="mt-2 h-[3px] w-full bg-[rgba(255,255,255,0.06)]">
          <div className="undo-bar h-full bg-lime" />
        </div>
      </div>
    );
  }

  // ── open: label + lock chip, inline pick chips ─────────────────────────────
  return (
    <div className={`${accent ? "animate-rowin" : ""} rounded-[14px] border ${base} px-3 py-2`}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-text">{label}</div>
          {caption && <div className="truncate text-[10px] leading-tight text-faint">{caption}</div>}
        </div>
        {secsToLock !== undefined && <LockChip secs={secsToLock} />}
      </div>
      <div className="flex gap-2">
        {picks.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => tap(p.key)}
            disabled={locked}
            className="flex flex-1 flex-col items-center justify-center rounded-[12px] px-2 py-1.5 transition active:scale-[0.98]"
            style={{
              minHeight: 52,
              background: "var(--color-panel2)",
              border: "1px solid var(--color-line)",
              opacity: locked ? 0.4 : 1,
            }}
          >
            <span className="max-w-full truncate text-[12px] font-semibold text-text">{p.label}</span>
            <span className="flex items-baseline gap-1.5">
              <span className="num text-[15px] font-bold text-lime">{fmtOdds(p.points)}</span>
              <span className="num text-[10px] text-faint">+{p.points} pts</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
