"use client";

import { PRIVY_SETUP_HINT, useWallet } from "@/lib/wallet/useWallet";
import { usd, TARGET_DEMO_LAMPORTS } from "@/lib/chain/config";

/**
 * The header balance control — sportsbook style, dollars only. Signed out →
 * "Sign in". Signed in → a clean "$50.00 · DEMO" chip with a one-tap
 * "Top up to $50" when the balance runs low. No crypto terms anywhere.
 */
export function WalletChip() {
  const w = useWallet();

  if (!w.configured) {
    return (
      <button type="button" onClick={w.signIn} title={PRIVY_SETUP_HINT} className="pill text-faint hover:text-text">
        sign-in setup needed
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

  const low = w.balanceLamports !== null && w.balanceLamports < TARGET_DEMO_LAMPORTS;
  return (
    <span className="flex items-center gap-1.5">
      {low && (
        <button
          type="button"
          onClick={() => w.topUp().catch(() => {})}
          disabled={w.funding}
          className="pill pill-lime px-2 py-0.5 text-[10px] hover:brightness-110 disabled:opacity-60"
        >
          {w.funding ? "topping up…" : "Top up to $50"}
        </button>
      )}
      <button
        type="button"
        onClick={w.signOut}
        title="Demo money — not real funds. Tap to sign out."
        className="pill text-text hover:brightness-110"
      >
        <span className="num">
          {w.balanceLamports === null ? "…" : `$${usd(w.balanceLamports).toFixed(2)}`}
        </span>
        <span className="ml-1.5 text-[9px] font-bold tracking-wide text-lime">DEMO</span>
      </button>
    </span>
  );
}
