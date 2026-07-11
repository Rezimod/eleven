"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRoom } from "@/lib/room/useRoom";
import { useOnchainRoom, type OnchainRoomState } from "@/lib/chain/useOnchainRoom";
import { useWallet } from "@/lib/wallet/useWallet";
import { fmtSol } from "@/lib/chain/config";
import { TIERS } from "@/components/RoomCard";
import { WalletChip } from "@/components/WalletChip";
import { Wordmark, LivePill } from "@/components/Brand";
import { ScoreHeader } from "@/components/room/ScoreHeader";
import { PredictionSlip } from "@/components/room/PredictionSlip";
import { StatsBar } from "@/components/room/StatsBar";
import { LiveBets } from "@/components/room/LiveBets";
import { Standings } from "@/components/room/PoolPanel";
import { WinnerBanner } from "@/components/room/WinnerBanner";
import { EventTicker } from "@/components/room/EventTicker";

const RAKE_BPS = 500; // 5%, capped at 10% on-chain

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
 * The PAID-ONLY entry gate. You cannot enter a room without an on-chain
 * `join_room`/`create_room` transaction moving the buy-in (demo devnet SOL)
 * into the room escrow PDA. Sign in → (auto-)fund → pay → enter.
 */
function JoinGate({ chain, buyIn }: { chain: OnchainRoomState; buyIn: number }) {
  const w = useWallet();
  const buyInLabel = `${fmtSol(buyIn)} ◎ (demo)`;

  let body: React.ReactNode;
  switch (chain.status) {
    case "loading":
      body = <p className="text-sm text-muted">Checking the on-chain room…</p>;
      break;
    case "signed-out":
      body = (
        <>
          <p className="text-sm text-muted">
            Email sign-in creates your embedded devnet wallet — no seed phrase. Demo SOL is
            airdropped automatically; no real money anywhere.
          </p>
          <button
            type="button"
            onClick={w.signIn}
            disabled={!w.ready}
            className="mt-3 w-full rounded-[14px] px-4 py-3 text-[15px] font-bold text-[#0a0d12] transition active:scale-[0.99] disabled:opacity-50"
            style={{ background: "var(--color-lime)" }}
          >
            Sign in to play
          </button>
          {!w.configured && (
            <p className="mt-2 text-xs text-red">
              Wallet auth is not configured — set <code>NEXT_PUBLIC_PRIVY_APP_ID</code> in{" "}
              <code>.env.local</code> (free app at dashboard.privy.io) and restart.
            </p>
          )}
        </>
      );
      break;
    case "closed":
      body = (
        <>
          <p className="text-sm text-muted">
            Joins close at kickoff (enforced on-chain) and this match is already underway.
          </p>
          <Link href="/" className="mt-3 block w-full rounded-[14px] bg-panel2 px-4 py-3 text-center text-sm font-bold">
            Pick an upcoming match ›
          </Link>
        </>
      );
      break;
    case "short":
      body = (
        <>
          <p className="text-sm text-muted">
            Not enough demo SOL for the {buyInLabel} buy-in — top up with a devnet airdrop.
          </p>
          <button
            type="button"
            onClick={() => w.topUp().catch(() => {})}
            disabled={w.funding}
            className="mt-3 w-full rounded-[14px] px-4 py-3 text-[15px] font-bold text-[#0a0d12] transition active:scale-[0.99] disabled:opacity-60"
            style={{ background: "var(--color-lime)" }}
          >
            {w.funding ? "Airdropping demo SOL…" : "Top up demo SOL (free)"}
          </button>
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
          {chain.status === "approving" ? "Approve in your wallet…" : "Paying buy-in into escrow…"}
        </button>
      );
      break;
    default:
      body = (
        <>
          {/* payment methods: demo crypto is live; fiat is display-only */}
          <div className="mb-3 flex flex-col gap-1.5">
            <div className="flex items-center justify-between rounded-[12px] bg-panel2 px-3 py-2 ring-1 ring-[rgba(198,255,58,0.4)]">
              <span className="text-[13px] font-semibold">◎ Demo SOL — devnet wallet</span>
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
            className="w-full rounded-[14px] px-4 py-3 text-[15px] font-bold text-[#0a0d12] transition active:scale-[0.99]"
            style={{
              background: "var(--color-lime)",
              boxShadow: "0 0 0 1px rgba(198,255,58,0.35), 0 12px 32px -14px rgba(198,255,58,0.7)",
            }}
          >
            Join for {buyInLabel}
          </button>
          <p className="mt-2 text-center text-[11px] text-faint">
            {chain.entryKind === "create"
              ? "Opens this room on devnet — you're player #1."
              : `${chain.players} in · pot ${fmtSol(chain.potLamports)} ◎.`}{" "}
            Your buy-in moves into the room escrow; it leaves only via proof-verified settlement or
            refund.
          </p>
        </>
      );
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="eyebrow text-[9px] text-faint">Buy-in · paid entry only</div>
          <div className="num text-lg leading-tight text-lime">{buyInLabel}</div>
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
  const chain = useOnchainRoom(fixtureId, buyIn, room.ready ? room.kickoffAt : null);
  const joined = chain.status === "joined";

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
  // On-chain truth once a room exists; the local engine only mirrors YOUR scoring.
  const players = Math.max(chain.players, joined ? 1 : 0);
  const pot = chain.potLamports;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-16">
      {/* ── sticky compact header: score + clock + phase ─────────────────── */}
      <div
        className="sticky top-0 z-20 -mx-4 mb-3 border-b border-line px-4 pb-3 pt-4"
        style={{ background: "rgba(10,13,18,0.82)", backdropFilter: "blur(12px)" }}
      >
        <header className="mb-2.5 flex items-center justify-between">
          <Link href="/">
            <Wordmark className="text-lg" />
          </Link>
          <div className="flex items-center gap-2">
            {competition && <span className="hidden text-[11px] text-faint sm:inline">{competition}</span>}
            {room.isReplay && <span className="pill px-2 py-0.5 text-[10px] text-faint">REPLAY</span>}
            {room.clock.running && <LivePill minute={room.clock.minute} />}
            <ShareButton />
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
            {gamePhase === "lobby" ? "pre-match bets" : gamePhase === "live" ? "live waves" : "settling"}
          </span>
        </div>
      </div>

      {!joined ? (
        /* ── NOT PAID IN: the only way through is the on-chain buy-in ─────── */
        <div className="flex flex-col gap-3">
          <JoinGate chain={chain} buyIn={buyIn} />
          {room.phase !== "ended" && <StatsBar home={homeShort || home} away={awayShort || away} stats={room.stats} />}
          <EventTicker events={room.events} />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* slim standings strip (pot lives here) */}
          <Standings standings={room.standings} pot={pot} />

          {/* slim meta line */}
          <div className="card flex items-center justify-between gap-2 px-3 py-2">
            <MetaStat label="Buy-in" value={`${fmtSol(buyIn)} ◎`} />
            <div className="h-6 w-px bg-line" />
            <MetaStat label="Players" value={String(players)} />
            <div className="h-6 w-px bg-line" />
            <MetaStat label="Your score" value={String(room.yourPoints)} accent />
            <div className="h-6 w-px bg-line" />
            <MetaStat label="Rake" value={`${RAKE_BPS / 100}%`} />
          </div>

          {room.phase === "ended" && (
            <WinnerBanner winners={room.winners} payouts={room.payouts} rake={room.rake} />
          )}

          {/* pre-match markets — compact rows (resolved rows keep their receipts) */}
          {room.ready && (
            <PredictionSlip markets={room.markets} phase={room.phase} lockAt={room.lockAt} onPredict={room.predict} />
          )}

          {/* live-wave markets — one-tap picks; your score moves live */}
          {room.phase !== "ended" && <LiveBets markets={room.liveMarkets} onPredict={room.predict} />}

          {/* context stats — display only, below the actionable markets */}
          {room.phase !== "ended" && <StatsBar home={homeShort || home} away={awayShort || away} stats={room.stats} />}

          <EventTicker events={room.events} />
        </div>
      )}
    </main>
  );
}
