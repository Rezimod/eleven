"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PublicKey } from "@solana/web3.js";

import { useWallet } from "@/lib/wallet/useWallet";
import { LAMPORTS_PER_SOL } from "./config";
import {
  buildCreateTx,
  buildJoinTx,
  fetchRoomsForFixture,
  findJoinedRoom,
  isJoinable,
  type OpenRoom,
} from "./rooms";

/**
 * The paid-entry gate. A player is IN a room iff their participant PDA exists
 * on devnet — which only happens after a `create_room`/`join_room` transaction
 * moved the buy-in into the room escrow. There is no free path.
 */

/** Fee + rent headroom on top of the buy-in (participant PDA rent, tx fee, room rent when creating). */
const ENTRY_BUFFER_LAMPORTS = 0.02 * LAMPORTS_PER_SOL;

export type EntryStatus =
  | "loading" // discovering rooms / participant PDA
  | "signed-out"
  | "closed" // kickoff passed — on-chain joins are closed
  | "ready" // can pay + enter (join or create)
  | "short" // insufficient demo SOL for the buy-in
  | "approving" // wallet approval prompt open
  | "confirming" // tx sent, awaiting devnet confirmation
  | "joined";

export interface OnchainRoomState {
  status: EntryStatus;
  /** On-chain players / pot for the room being shown (0 until a room exists). */
  players: number;
  potLamports: number;
  /** Whether entry would create a fresh room (you're player #1) or join one. */
  entryKind: "create" | "join";
  roomAddress: string | null;
  error: string | null;
  /** Pay the buy-in and enter (sends the on-chain transaction). */
  join: () => Promise<void>;
}

export function useOnchainRoom(fixtureId: number, buyInLamports: number, kickoffTsMs: number | null): OnchainRoomState {
  const wallet = useWallet();
  const [rooms, setRooms] = useState<OpenRoom[]>([]);
  const [joinedRoom, setJoinedRoom] = useState<OpenRoom | null>(null);
  const [discovered, setDiscovered] = useState(false);
  const [txPhase, setTxPhase] = useState<"idle" | "approving" | "confirming">("idle");
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const all = await fetchRoomsForFixture(fixtureId);
      setRooms(all);
      setJoinedRoom(wallet.address ? await findJoinedRoom(all, new PublicKey(wallet.address)) : null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDiscovered(true);
    }
  }, [fixtureId, wallet.address]);

  useEffect(() => {
    setDiscovered(false);
    refresh();
    const t = setInterval(refresh, 12_000);
    return () => clearInterval(t);
  }, [refresh]);

  const nowSec = Math.floor(Date.now() / 1000);
  const openRoom = useMemo(
    () => rooms.find((r) => isJoinable(r.account, buyInLamports, nowSec)) ?? null,
    [rooms, buyInLamports, nowSec],
  );

  const join = useCallback(async () => {
    if (inFlight.current || !wallet.signedIn || !wallet.address || joinedRoom) return;
    inFlight.current = true;
    setError(null);
    setTxPhase("approving");
    try {
      const me = new PublicKey(wallet.address);
      const entry = openRoom
        ? await buildJoinTx(openRoom, me)
        : await buildCreateTx(fixtureId, buyInLamports, Math.floor((kickoffTsMs ?? Date.now()) / 1000), me);
      const sigPromise = wallet.sendTx(entry.tx);
      setTxPhase("confirming");
      await sigPromise;
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(/reject|denied|cancel/i.test(msg) ? "approval declined — nothing was paid" : msg);
    } finally {
      setTxPhase("idle");
      inFlight.current = false;
    }
  }, [wallet, joinedRoom, openRoom, fixtureId, buyInLamports, kickoffTsMs, refresh]);

  const shownRoom = joinedRoom ?? openRoom;
  const kickoffPassed = kickoffTsMs !== null && Date.now() >= kickoffTsMs;

  let status: EntryStatus;
  if (joinedRoom) status = "joined";
  else if (txPhase === "approving") status = "approving";
  else if (txPhase === "confirming") status = "confirming";
  else if (!wallet.ready || (wallet.signedIn && !discovered)) status = "loading";
  else if (!wallet.signedIn) status = "signed-out";
  else if (!openRoom && kickoffPassed) status = "closed";
  else if (wallet.balanceLamports !== null && wallet.balanceLamports < buyInLamports + ENTRY_BUFFER_LAMPORTS)
    status = "short";
  else status = "ready";

  return {
    status,
    players: shownRoom?.account.playerCount ?? 0,
    potLamports: shownRoom ? shownRoom.account.potLamports.toNumber() : 0,
    entryKind: openRoom ? "join" : "create",
    roomAddress: shownRoom?.pubkey.toBase58() ?? null,
    error,
    join,
  };
}
