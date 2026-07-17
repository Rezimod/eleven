"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRoom } from "@/lib/room/useRoom";
import { useOnchainRoom, type OnchainRoomState } from "@/lib/chain/useOnchainRoom";
import { useWallet } from "@/lib/wallet/useWallet";
import { fmtUsd } from "@/lib/chain/config";
import { TIERS } from "@/components/RoomCard";
import { WalletChip } from "@/components/WalletChip";
import { Wordmark, LivePill } from "@/components/Brand";
import { ScoreHeader } from "@/components/room/ScoreHeader";
import { PredictionSlip } from "@/components/room/PredictionSlip";
import { StatsBar } from "@/components/room/StatsBar";
import { LiveBets } from "@/components/room/LiveBets";
import { BetSlip } from "@/components/room/BetSlip";
import { Standings } from "@/components/room/PoolPanel";
import { WinnerBanner } from "@/components/room/WinnerBanner";
import { EventTicker } from "@/components/room/EventTicker";

const RAKE_BPS = 500; // 5% house fee, capped at 10% on-chain

/** Copy this room's deep link — the match room is fully addressable by its URL. */
function ShareButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window === "undefined") return;
        navigator.clipboard?.writeText(window.location.href).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          },
          () => {},
        );
      }}
      className="pill px-2 py-0.5 text-[10px] text-faint hover:text-text"
    >
      {copied ? "copied ✓" : "share"}
    </button>
  );
}

function MetaStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="eyebrow text-[9px] text-faint">{label}</span>
      <span className={`num text-sm leading-none ${accent ? "text-lime" : "text-text"}`}>{value}</span>
    </div>
  );
}

/**
 * The PAID-ONLY entry gate — sportsbook style, dollars only, no sign-in. A
 * guest wallet is provisioned silently on landing with $15 demo; entering a
 * room still requires paying the entry (an on-chain transaction moving the
 * buy-in into the room escrow, under the hood). No crypto terms in the UI.
 */
function JoinGate({ chain, buyIn }: { chain: OnchainRoomState; buyIn: number }) {
  const w = useWallet();
  const buyInLabel = fmtUsd(buyIn);

  let body: React.ReactNode;
  switch (chain.status) {
    case "loading":
      body = <p className="text-sm text-muted">Checking the room…</p>;
      break;
    case "closed":
      body = (
        <>
          <p className="text-sm text-muted">Entries closed — this match is past the 80-minute late-join cutoff.</p>
          <Link href="/" className="mt-3 block w-full rounded-[14px] bg-panel2 px-4 py-3 text-center text-sm font-bold">
            Pick another match ›
          </Link>
        </>
      );
      break;
    case "short":
      body = (
        <>
          <p className="text-sm text-muted">
            Not enough demo money for the {buyInLabel} entry — top up free.
          </p>
          <button
            type="button"
            onClick={() => w.topUp().catch(() => {})}
            disabled={w.funding}
            className="mt-3 w-full rounded-[14px] px-4 py-3 text-[15px] font-bold text-[#0a0d12] transition active:scale-[0.99] disabled:opacity-60"
            style={{ background: "var(--color-lime)" }}
          >
            {w.funding ? "Topping up…" : "Top up to $15"}
          </button>
          {w.fundingNote && <p className="mt-2 text-xs text-red">{w.fundingNote}</p>}
        </>
      );
      break;
    case "approving":
    case "confirming":
      body = (
        <button
          type="button"
          disabled
          className="w-full rounded-[14px] bg-panel2 px-4 py-3 text-[15px] font-bold text-muted"
        >
          Placing your entry…
        </button>
      );
      break;
    default:
      body = (
        <>
          {/* payment methods: demo balance is live; fiat is display-only */}
          <div className="mb-3 flex flex-col gap-1.5">
            <div className="flex items-center justify-between rounded-[12px] bg-panel2 px-3 py-2 ring-1 ring-[rgba(198,255,58,0.4)]">
              <span className="text-[13px] font-semibold">$ Demo balance</span>
              <span className="pill pill-lime px-2 py-0.5 text-[9px]">SELECTED</span>
            </div>
            <div aria-disabled className="flex items-center justify-between rounded-[12px] bg-panel2 px-3 py-2 opacity-45">
              <span className="text-[13px] font-semibold">🏦 Bank transfer</span>
              <span className="pill px-2 py-0.5 text-[9px] text-faint">COMING SOON</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => chain.join()}
            className="w-full rounded-[14px] px-4 py-3 text-[16px] font-bold text-[#0a0d12] transition active:scale-[0.99]"
            style={{
              background: "var(--color-lime)",
              boxShadow: "0 0 0 1px rgba(198,255,58,0.35), 0 12px 32px -14px rgba(198,255,58,0.7)",
            }}
          >
            Join {buyInLabel}
          </button>
          <p className="mt-2 text-center text-[11px] text-faint">
            {chain.entryKind === "create"
              ? "You're first in — the pot starts with your entry."
              : `${chain.players} in · pot ${fmtUsd(chain.potLamports)}.`}{" "}
            Every entry goes straight into the prize pot; payouts are automatic and independently
            verifiable.
          </p>
        </>
      );
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="eyebrow text-[9px] text-faint">Entry</div>
          <div className="num text-xl font-bold leading-tight text-lime">{buyInLabel}</div>
        </div>
        <WalletChip />
      </div>
      {body}
      {chain.error && <p className="mt-2 text-xs text-red">{chain.error}</p>}
    </div>
  );
}

export function MatchRoom({ fixtureId, tier }: { fixtureId: number; tier: string }) {
  const buyIn = (TIERS.find((t) => t.key === tier) ?? TIERS[0]).buyIn;
  const room = useRoom(fixtureId, `${fixtureId}-${tier}`, buyIn, RAKE_BPS);
  // A replay re-runs a finished fixture from kickoff, so its real kickoff is days
  // past the 80-minute join cutoff — which would render the room "Entries closed".
  // Anchor the entry gate + the on-chain join deadline to a stable "now" for
  // replays, so a finished World Cup match is fully joinable and settleable on
  // camera (and for judges testing post-deadline). The feed still replays the
  // real event stream; only the paid-entry window is shifted to the present.
  const [replayKickoff] = useState(() => Date.now());
  const chain = useOnchainRoom(
    fixtureId,
    buyIn,
    room.ready ? (room.isReplay ? replayKickoff : room.kickoffAt) : null,
  );
  const joined = chain.status === "joined";
  // Free play (no wallet, demo money): the prediction + scoring + verifiable
  // settlement all run in the client engine (room.*); the chain is only the paid
  // escrow. Free play lets anyone play the full predict → settle → receipt loop
  // instantly — the hero path from docs/DEMO.md — without an on-chain entry.
  const [freePlay, setFreePlay] = useState(false);
  const inRoom = joined || freePlay;

  // Local tick so the per-row lock countdowns update without feed events.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (room.phase === "ended") return;
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [room.phase]);

  const { home, away, homeShort, awayShort, competition } = room.match;
  // Room state machine: Lobby (pre-match) → Live → FullTime.
  const gamePhase = room.phase === "ended" ? "fulltime" : room.phase === "commit" ? "lobby" : "live";
  // On-chain truth once a real room exists; otherwise (free-play / sim demo) the
  // local engine is the source of the pot + player count (incl. exhibition bots).
  const players = Math.max(chain.players, room.players, inRoom ? 1 : 0);
  const pot = chain.potLamports || room.pot;
  const secsToKickoff = Math.max(0, Math.ceil((room.kickoffAt - Date.now()) / 1000));

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-28">
      {/* ── sticky live scoreboard header ─────────────────────────────────── */}
      <div
        className="sticky top-0 z-20 -mx-4 mb-3 border-b border-line px-4 pb-3 pt-4"
        style={{ background: "rgba(10,13,18,0.82)", backdropFilter: "blur(12px)" }}
      >
        <header className="mb-2.5 flex items-center justify-between">
          <Link href="/">
            <Wordmark className="text-lg" />
          </Link>
          <div className="flex items-center gap-2">
            {room.isReplay && <span className="pill px-2 py-0.5 text-[10px] text-faint">REPLAY</span>}
            {room.clock.running && <LivePill minute={room.clock.minute} />}
            <ShareButton />
            <WalletChip />
          </div>
        </header>

        <ScoreHeader
          home={home}
          away={away}
          homeShort={homeShort}
          awayShort={awayShort}
          competition={competition}
          score={room.score}
          clock={room.clock}
        />

        {/* phase strip */}
        <div className="mt-2.5 flex items-center gap-1.5 text-[10px]">
          {(["lobby", "live", "fulltime"] as const).map((p, i) => {
            const active = p === gamePhase;
            const label = p === "lobby" ? "LOBBY" : p === "live" ? "LIVE" : "FULL TIME";
            return (
              <div key={p} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-faint">→</span>}
                <span className={`pill px-2 py-0.5 ${active ? "pill-lime" : "text-faint"}`}>{label}</span>
              </div>
            );
          })}
          <span className="ml-auto text-faint">
            {gamePhase === "lobby" ? "pre-match bets open" : gamePhase === "live" ? "live bets" : "settling"}
          </span>
        </div>
      </div>

      {!inRoom ? (
        /* ── NOT IN: pay to enter the prize pool, or play free (demo) ───────── */
        <div className="flex flex-col gap-3">
          <JoinGate chain={chain} buyIn={buyIn} />
          <button
            type="button"
            onClick={() => setFreePlay(true)}
            className="w-full rounded-[14px] border border-line bg-panel2 px-4 py-3 text-center text-sm font-bold text-text transition active:scale-[0.99]"
          >
            Play free — no wallet, no entry ▸
          </button>
          {room.phase !== "ended" && <StatsBar home={homeShort || home} away={awayShort || away} stats={room.stats} />}
          <EventTicker events={room.events} />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* leaderboard strip (pot lives here) */}
          <Standings standings={room.standings} pot={pot} rakeBps={room.rakeBps} />

          {/* slim meta line */}
          <div className="card flex items-center justify-between gap-2 px-3 py-2">
            <MetaStat label="Entry" value={fmtUsd(buyIn)} />
            <div className="h-6 w-px bg-line" />
            <MetaStat label="Players" value={String(players)} />
            <div className="h-6 w-px bg-line" />
            <MetaStat label="Your points" value={String(room.yourPoints)} accent />
            <div className="h-6 w-px bg-line" />
            <MetaStat label="Fee" value={`${RAKE_BPS / 100}%`} />
          </div>

          {room.phase === "ended" && (
            <WinnerBanner winners={room.winners} payouts={room.payouts} rake={room.rake} />
          )}

          {/* pre-match markets — sportsbook odds rows (resolved rows keep receipts) */}
          {room.ready && (
            <PredictionSlip markets={room.markets} phase={room.phase} lockAt={room.lockAt} onPredict={room.predict} />
          )}

          {/* live markets: open rows during play, an "opens at kickoff" note before */}
          {room.phase === "commit" && (
            <div className="card flex items-center justify-between px-3 py-2.5">
              <span className="text-[13px] font-semibold text-muted">Live bets</span>
              <span className="pill px-2 py-0.5 text-[10px] text-faint">
                {secsToKickoff > 0 ? (
                  <>
                    opens at kickoff · <span className="num">{Math.floor(secsToKickoff / 60)}m {secsToKickoff % 60}s</span>
                  </>
                ) : (
                  "opens at kickoff"
                )}
              </span>
            </div>
          )}
          {room.phase !== "ended" && <LiveBets markets={room.liveMarkets} onPredict={room.predict} />}

          {/* context stats — display only, below the actionable markets */}
          {room.phase !== "ended" && <StatsBar home={homeShort || home} away={awayShort || away} stats={room.stats} />}

          <EventTicker events={room.events} />

          {/* docked sportsbook bet slip — your picks + totals */}
          <BetSlip markets={room.markets} liveMarkets={room.liveMarkets} />
        </div>
      )}
    </main>
  );
}
