"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

/**
 * Wallet abstraction for the SECONDARY "Play with USDC" path. Free play never
 * touches this. Ships with a demo stub so the app builds and runs with zero env;
 * plugging Privy is a drop-in (see TODO in `connect`).
 */
export interface WalletState {
  connected: boolean;
  connecting: boolean;
  address: string | null;
  /** True once NEXT_PUBLIC_PRIVY_APP_ID is configured. */
  privyConfigured: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState | null>(null);

function shortDemoAddress(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `Demo${s}…${s.slice(0, 3)}`;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const privyConfigured = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [address, setAddress] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setConnecting(true);
    // TODO(privy): when NEXT_PUBLIC_PRIVY_APP_ID is set, dynamically import
    // `@privy-io/react-auth`, render its provider, and open the login modal here.
    // The rest of the app only reads `connected`/`address`, so this is the only
    // file that changes. Until then we use a demo stub wallet.
    await new Promise((r) => setTimeout(r, 350));
    setAddress(shortDemoAddress());
    setConnected(true);
    setConnecting(false);
  }, []);

  const disconnect = useCallback(() => {
    setConnected(false);
    setAddress(null);
  }, []);

  const value = useMemo<WalletState>(
    () => ({ connected, connecting, address, privyConfigured, connect, disconnect }),
    [connected, connecting, address, privyConfigured, connect, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within <WalletProvider>");
  return ctx;
}
