"use client";

import { PRIVY_SETUP_HINT, useWallet } from "@/lib/wallet/useWallet";
import { fmtSol } from "@/lib/chain/config";

function shortAddr(a: string): string {
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

/**
 * The header wallet control. Signed out → "Sign in" (Privy email → embedded
 * devnet wallet). Signed in → balance clearly labeled DEMO · devnet.
 */
export function WalletChip() {
  const w = useWallet();

  if (!w.configured) {
    return (
      <button type="button" onClick={w.signIn} title={PRIVY_SETUP_HINT} className="pill text-faint hover:text-text">
        wallet setup needed
      </button>
    );
  }

  if (!w.signedIn) {
    return (
      <button type="button" onClick={w.signIn} disabled={!w.ready} className="pill pill-lime hover:brightness-110 disabled:opacity-50">
        Sign in
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1.5">
      <span className="pill text-text" title={`${w.address} · demo devnet SOL, no real money`}>
        <span className="num">{w.balanceLamports === null ? "…" : fmtSol(w.balanceLamports)} ◎</span>
        <span className="ml-1.5 text-[9px] font-bold tracking-wide text-lime">DEMO · devnet</span>
      </span>
      <button
        type="button"
        onClick={w.signOut}
        title={`Sign out ${w.address ? shortAddr(w.address) : ""}`}
        className="pill px-2 text-faint hover:text-text"
      >
        ✕
      </button>
    </span>
  );
}
