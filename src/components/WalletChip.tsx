"use client";

import { useWallet } from "@/lib/wallet/useWallet";
import { usd, TARGET_DEMO_LAMPORTS } from "@/lib/chain/config";

/**
 * The header balance chip — sportsbook style, dollars only, no sign-in. The
 * guest wallet is provisioned silently on landing with $15 demo, so this is
 * purely a balance display plus a one-tap top-up when low. No crypto terms.
 */
export function WalletChip() {
  const w = useWallet();

  const low = w.ready && w.balanceLamports !== null && w.balanceLamports < TARGET_DEMO_LAMPORTS;
  return (
    <span className="flex items-center gap-1.5">
      {low && (
        <button
          type="button"
          onClick={() => w.topUp().catch(() => {})}
          disabled={w.funding}
          title={w.fundingNote ?? undefined}
          className="pill pill-lime px-2 py-0.5 text-[10px] hover:brightness-110 disabled:opacity-60"
        >
          {w.funding ? "topping up…" : "Top up to $15"}
        </button>
      )}
      <span className="pill text-text" title="Demo money — not real funds.">
        <span className="num">
          {w.balanceLamports === null ? "…" : `$${usd(w.balanceLamports).toFixed(2)}`}
        </span>
        <span className="ml-1.5 text-[9px] font-bold tracking-wide text-lime">DEMO</span>
      </span>
    </span>
  );
}
