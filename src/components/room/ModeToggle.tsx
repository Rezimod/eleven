"use client";

import { useWallet } from "@/lib/wallet/useWallet";

export type PlayMode = "free" | "usdc";

export function ModeToggle({ mode, onMode }: { mode: PlayMode; onMode: (m: PlayMode) => void }) {
  const wallet = useWallet();

  const selectUsdc = async () => {
    if (!wallet.connected) await wallet.connect();
    onMode("usdc");
  };

  return (
    <div className="card flex items-center justify-between p-3">
      <div className="flex rounded-full bg-surface2 p-1">
        <button
          type="button"
          onClick={() => onMode("free")}
          className={`btn rounded-full px-4 py-1.5 text-sm ${mode === "free" ? "btn-neon" : "text-muted"}`}
        >
          Free play
        </button>
        <button
          type="button"
          onClick={selectUsdc}
          className={`btn rounded-full px-4 py-1.5 text-sm ${mode === "usdc" ? "btn-neon" : "text-muted"}`}
        >
          USDC pool
        </button>
      </div>

      <div className="text-right text-xs">
        {mode === "usdc" && wallet.connected ? (
          <span className="text-win">● {wallet.address}</span>
        ) : mode === "usdc" ? (
          <span className="text-muted">connect to stake</span>
        ) : (
          <span className="text-faint">no wallet needed</span>
        )}
        {!wallet.privyConfigured && (
          <div className="text-[10px] text-faint">demo wallet · Privy drop-in</div>
        )}
      </div>
    </div>
  );
}
