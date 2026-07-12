"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Keypair, PublicKey, type Transaction } from "@solana/web3.js";

import { TARGET_DEMO_LAMPORTS, getConnection } from "@/lib/chain/config";

/**
 * NO SIGN-IN — land and play. A guest wallet is provisioned SILENTLY on first
 * load (a client keypair persisted in localStorage) and granted $15.00 demo
 * money from the server faucet (once per IP). The wallet exists purely so the
 * on-chain escrow entry works under the hood; the user never sees it.
 *
 * DEVNET DEMO ONLY: the secret lives in localStorage, which is fine for
 * throwaway demo money and would be unacceptable for real funds. The RPC and
 * chain are pinned to devnet in lib/chain/config (mainnet URLs are refused).
 */

const STORAGE_KEY = "eleven-guest-wallet-v1";

export interface WalletState {
  /** True once the guest wallet is provisioned (a beat after first render). */
  ready: boolean;
  address: string | null;
  /** Demo balance in lamports; null while loading. */
  balanceLamports: number | null;
  /** Demo grant/top-up in flight. */
  funding: boolean;
  /** Set when the faucet declines (e.g. this network already claimed its $15). */
  fundingNote: string | null;
  /** Ask the server faucet to top this guest up (granted once per IP). */
  topUp: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  /** Sign + send a devnet transaction with the guest keypair; resolves confirmed. */
  sendTx: (tx: Transaction) => Promise<string>;
}

const WalletContext = createContext<WalletState | null>(null);

/** Load-or-create the persisted guest keypair. localStorage only — demo money. */
function loadGuestKeypair(): Keypair {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  } catch {
    /* corrupted entry → fall through to a fresh guest */
  }
  const kp = Keypair.generate();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(kp.secretKey)));
  return kp;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [keypair, setKeypair] = useState<Keypair | null>(null);
  const [balanceLamports, setBalance] = useState<number | null>(null);
  const [funding, setFunding] = useState(false);
  const [fundingNote, setFundingNote] = useState<string | null>(null);
  const granted = useRef(false);

  // Silent provisioning: no login screen, no prompt — the wallet just exists.
  useEffect(() => {
    setKeypair(loadGuestKeypair());
  }, []);

  const address = keypair ? keypair.publicKey.toBase58() : null;

  const refreshBalance = useCallback(async () => {
    if (!keypair) return;
    try {
      setBalance(await getConnection().getBalance(keypair.publicKey));
    } catch {
      /* transient RPC failure — keep the last known balance */
    }
  }, [keypair]);

  useEffect(() => {
    if (!keypair) return;
    refreshBalance();
    const t = setInterval(refreshBalance, 15_000);
    return () => clearInterval(t);
  }, [keypair, refreshBalance]);

  const topUp = useCallback(async () => {
    if (!address || funding) return;
    setFunding(true);
    setFundingNote(null);
    try {
      const r = await fetch("/api/demo/airdrop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      if (!r.ok) {
        setFundingNote((await r.text()) || "demo top-up unavailable right now");
        return;
      }
      await refreshBalance();
    } finally {
      setFunding(false);
    }
  }, [address, funding, refreshBalance]);

  // GRANT $15 ON LANDING: the persisted wallet keeps its balance across
  // refreshes (the chain is the truth — no re-grant), and the server enforces
  // the once-per-IP rule; this client-side guard just avoids redundant calls.
  useEffect(() => {
    if (!address || balanceLamports === null || granted.current) return;
    if (balanceLamports >= TARGET_DEMO_LAMPORTS) return;
    granted.current = true;
    topUp().catch(() => {});
  }, [address, balanceLamports, topUp]);

  const sendTx = useCallback(
    async (tx: Transaction) => {
      if (!keypair) throw new Error("guest wallet not ready yet");
      const conn = getConnection();
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
      tx.feePayer = new PublicKey(keypair.publicKey);
      tx.recentBlockhash = blockhash;
      tx.sign(keypair);
      const sig = await conn.sendRawTransaction(tx.serialize());
      const res = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
      if (res.value.err) throw new Error(`transaction failed: ${JSON.stringify(res.value.err)}`);
      refreshBalance();
      return sig;
    },
    [keypair, refreshBalance],
  );

  const value = useMemo<WalletState>(
    () => ({
      ready: keypair !== null,
      address,
      balanceLamports,
      funding,
      fundingNote,
      topUp,
      refreshBalance,
      sendTx,
    }),
    [keypair, address, balanceLamports, funding, fundingNote, topUp, refreshBalance, sendTx],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within <WalletProvider>");
  return ctx;
}
