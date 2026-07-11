"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { useSignAndSendTransaction, useWallets } from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { utils } from "@coral-xyz/anchor";
import type { Transaction } from "@solana/web3.js";

import { RPC_URL, SOLANA_CHAIN, TARGET_DEMO_LAMPORTS, WS_URL, getConnection } from "@/lib/chain/config";

/**
 * Real wallet auth via Privy: email sign-in → embedded Solana wallet on DEVNET,
 * no seed phrase. All funds are DEMO devnet SOL (airdropped) — never mainnet,
 * never real money (the chain id + RPC are pinned to devnet in lib/chain/config).
 */

export const PRIVY_SETUP_HINT =
  "Set NEXT_PUBLIC_PRIVY_APP_ID=<your Privy app id> in .env.local — create a free app at " +
  "https://dashboard.privy.io (enable Email login + Solana embedded wallets), then restart `npm run dev`.";


export interface WalletState {
  /** False until NEXT_PUBLIC_PRIVY_APP_ID is set — sign-in is unavailable. */
  configured: boolean;
  ready: boolean;
  signedIn: boolean;
  address: string | null;
  /** DEMO devnet SOL balance; null while loading. */
  balanceLamports: number | null;
  /** Demo airdrop in flight. */
  funding: boolean;
  signIn: () => void;
  signOut: () => void;
  /** One-tap demo top-up: airdrops devnet SOL to the embedded wallet. */
  topUp: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  /** Sign + send a devnet transaction with the embedded wallet; resolves to the confirmed signature. */
  sendTx: (tx: Transaction) => Promise<string>;
}

const WalletContext = createContext<WalletState | null>(null);

async function requestDemoAirdrop(address: string): Promise<void> {
  const r = await fetch("/api/demo/airdrop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  });
  if (!r.ok) throw new Error((await r.text()) || `airdrop failed (HTTP ${r.status})`);
}

function InnerWalletProvider({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();

  const wallet = wallets[0] ?? null;
  const address = wallet?.address ?? null;

  const [balanceLamports, setBalance] = useState<number | null>(null);
  const [funding, setFunding] = useState(false);
  const autoFunded = useRef<Set<string>>(new Set());

  const refreshBalance = useCallback(async () => {
    if (!address) return;
    try {
      const { PublicKey } = await import("@solana/web3.js");
      setBalance(await getConnection().getBalance(new PublicKey(address)));
    } catch {
      /* transient RPC failure — keep the last known balance */
    }
  }, [address]);

  useEffect(() => {
    setBalance(null);
    if (!address) return;
    refreshBalance();
    const t = setInterval(refreshBalance, 15_000);
    return () => clearInterval(t);
  }, [address, refreshBalance]);

  const topUp = useCallback(async () => {
    if (!address || funding) return;
    setFunding(true);
    try {
      await requestDemoAirdrop(address);
      await refreshBalance();
    } finally {
      setFunding(false);
    }
  }, [address, funding, refreshBalance]);

  // GUARANTEED $50 DEMO BALANCE: on sign-in, any account below the target is
  // topped up to it automatically — a brand-new account starts at $50.00 and
  // can play instantly. Once per address per session; manual "Top up to $50"
  // covers mid-session shortfalls.
  useEffect(() => {
    if (!authenticated || !address || balanceLamports === null) return;
    if (balanceLamports >= TARGET_DEMO_LAMPORTS) return;
    if (autoFunded.current.has(address)) return;
    autoFunded.current.add(address);
    topUp().catch(() => {
      /* faucet dry — the join gate offers a manual retry */
    });
  }, [authenticated, address, balanceLamports, topUp]);

  const sendTx = useCallback(
    async (tx: Transaction) => {
      if (!wallet || !address) throw new Error("sign in first");
      const { PublicKey } = await import("@solana/web3.js");
      const conn = getConnection();
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
      tx.feePayer = new PublicKey(address);
      tx.recentBlockhash = blockhash;
      const { signature } = await signAndSendTransaction({
        transaction: new Uint8Array(tx.serialize({ requireAllSignatures: false, verifySignatures: false })),
        wallet,
        chain: SOLANA_CHAIN,
      });
      const sig = utils.bytes.bs58.encode(signature);
      const res = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
      if (res.value.err) throw new Error(`transaction failed: ${JSON.stringify(res.value.err)}`);
      refreshBalance();
      return sig;
    },
    [wallet, address, signAndSendTransaction, refreshBalance],
  );

  const value = useMemo<WalletState>(
    () => ({
      configured: true,
      ready,
      signedIn: ready && authenticated && !!address,
      address,
      balanceLamports,
      funding,
      signIn: login,
      signOut: logout,
      topUp,
      refreshBalance,
      sendTx,
    }),
    [ready, authenticated, address, balanceLamports, funding, login, logout, topUp, refreshBalance, sendTx],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

/** No-Privy fallback: the app renders, sign-in explains exactly what to set. */
function UnconfiguredWalletProvider({ children }: { children: React.ReactNode }) {
  const warned = useRef(false);
  const signIn = useCallback(() => {
    console.error(PRIVY_SETUP_HINT);
    if (typeof window !== "undefined") window.alert(PRIVY_SETUP_HINT);
  }, []);
  useEffect(() => {
    if (!warned.current) {
      warned.current = true;
      console.warn(`ELEVEN wallet auth is not configured. ${PRIVY_SETUP_HINT}`);
    }
  }, []);
  const value = useMemo<WalletState>(
    () => ({
      configured: false,
      ready: true,
      signedIn: false,
      address: null,
      balanceLamports: null,
      funding: false,
      signIn,
      signOut: () => {},
      topUp: async () => {},
      refreshBalance: async () => {},
      sendTx: async () => {
        throw new Error(PRIVY_SETUP_HINT);
      },
    }),
    [signIn],
  );
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return <UnconfiguredWalletProvider>{children}</UnconfiguredWalletProvider>;
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email"],
        appearance: { theme: "dark", accentColor: "#c6ff3a", walletChainType: "solana-only" },
        embeddedWallets: { solana: { createOnLogin: "users-without-wallets" }, showWalletUIs: true },
        solana: {
          rpcs: {
            [SOLANA_CHAIN]: {
              rpc: createSolanaRpc(RPC_URL),
              rpcSubscriptions: createSolanaRpcSubscriptions(WS_URL),
            },
          },
        },
      }}
    >
      <InnerWalletProvider>{children}</InnerWalletProvider>
    </PrivyProvider>
  );
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within <WalletProvider>");
  return ctx;
}
