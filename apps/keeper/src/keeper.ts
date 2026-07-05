import type { Logger } from "./logger.ts";
import type { SettleArgs } from "./proof.ts";
import { KeeperStore } from "./state.ts";
import type { Action, Decision, RoomWatch, StreamEvent } from "./types.ts";
import { accumulate, emptyState, isTrue, type FixtureState } from "./watcher.ts";

/** Submits proven outcomes on-chain. Injected so the loop is testable + the
 *  broadcast target (real chain vs dry-run) is swappable. */
export interface Submitter {
  resolveMarket(d: Decision, proof: SettleArgs | null): Promise<string>;
  settleRoom(room: RoomWatch): Promise<string>;
}

export type ProofFor = (d: Decision) => Promise<SettleArgs | null>;

/**
 * The autonomous settlement loop. Consumes normalized stream events, tracks each
 * room's provable markets, and the instant a market's condition is decided
 * submits `resolve_market`; once all markets are resolved (or the deadline
 * passes) it submits `settle_room`. Every side-effect is guarded by persistent
 * state, so it never double-resolves or double-settles — across reconnects OR
 * crashes.
 */
export class Keeper {
  private readonly state = new Map<number, FixtureState>();
  private readonly roomsByFixture = new Map<number, RoomWatch[]>();
  private readonly rooms: RoomWatch[];
  private readonly store: KeeperStore;
  private readonly submitter: Submitter;
  private readonly proofFor: ProofFor;
  private readonly log: Logger;

  constructor(rooms: RoomWatch[], store: KeeperStore, submitter: Submitter, proofFor: ProofFor, log: Logger) {
    this.rooms = rooms;
    this.store = store;
    this.submitter = submitter;
    this.proofFor = proofFor;
    this.log = log;
    for (const r of rooms) {
      const list = this.roomsByFixture.get(r.fixtureId) ?? [];
      list.push(r);
      this.roomsByFixture.set(r.fixtureId, list);
    }
  }

  /** Process one stream event. Returns the actions taken (for logging/tests). */
  async onEvent(ev: StreamEvent): Promise<Action[]> {
    const rooms = this.roomsByFixture.get(ev.fixtureId);
    if (!rooms || ev.kind === "heartbeat" || ev.kind === "kickoff") {
      this.store.advance(ev.seq); // ignore edge/unwatched events, but keep resume point moving
      return [];
    }

    const st = accumulate(this.state.get(ev.fixtureId) ?? emptyState(), ev);
    this.state.set(ev.fixtureId, st);

    const actions: Action[] = [];
    for (const room of rooms) {
      // Resolve any market whose predicate just became provably true.
      for (const market of room.markets) {
        if (this.store.isResolved(KeeperStore.marketKey(room.roomId, market.index))) continue;
        if (!isTrue(st, market)) continue;
        const a = await this.resolve({ room, market, kind: "ProveYes", targetTs: ev.tsSec, seq: ev.seq });
        if (a) actions.push(a);
      }
      // At full time, time out anything still unproven and settle.
      if (ev.kind === "fulltime") {
        actions.push(...(await this.finalizeRoom(room, ev.tsSec, ev.seq)));
      }
    }

    this.store.advance(ev.seq);
    return actions;
  }

  /** Deadline-driven finalization (called at full time and by the wall-clock tick). */
  async finalizeRoom(room: RoomWatch, nowSec: number, seq: number): Promise<Action[]> {
    const actions: Action[] = [];
    const st = this.state.get(room.fixtureId) ?? emptyState();
    for (const market of room.markets) {
      if (this.store.isResolved(KeeperStore.marketKey(room.roomId, market.index))) continue;
      const kind = isTrue(st, market) ? "ProveYes" : "TimeoutNo";
      const a = await this.resolve({ room, market, kind, targetTs: nowSec, seq });
      if (a) actions.push(a);
    }
    const s = await this.settle(room);
    if (s) actions.push(s);
    return actions;
  }

  /** Wall-clock tick: settle rooms whose deadline has passed even without an FT event. */
  async tick(nowSec: number): Promise<Action[]> {
    const actions: Action[] = [];
    for (const room of this.rooms) {
      if (this.store.isSettled(room.roomId)) continue;
      if (nowSec < room.endTs) continue;
      actions.push(...(await this.finalizeRoom(room, nowSec, this.store.seq)));
    }
    return actions;
  }

  private async resolve(d: Decision): Promise<Action | null> {
    const key = KeeperStore.marketKey(d.room.roomId, d.market.index);
    if (this.store.isResolved(key)) return null;
    try {
      const proof = d.kind === "ProveYes" ? await this.proofFor(d) : null;
      const sig = await this.submitter.resolveMarket(d, proof);
      this.store.markResolved(key); // only after the tx is confirmed — a throw above means we retry
      this.log.info("resolved market", {
        room: d.room.roomId,
        market: d.market.index,
        label: d.market.label,
        kind: d.kind,
        sig,
      });
      return { type: "resolve", roomId: d.room.roomId, marketIndex: d.market.index, resolveKind: d.kind, sig };
    } catch (e) {
      this.log.error("resolve failed", { room: d.room.roomId, market: d.market.index, err: String(e) });
      return null;
    }
  }

  private async settle(room: RoomWatch): Promise<Action | null> {
    if (this.store.isSettled(room.roomId)) return null;
    // Never settle until every market has a resolution (each yes required a proof).
    const allResolved = room.markets.every((m) => this.store.isResolved(KeeperStore.marketKey(room.roomId, m.index)));
    if (!allResolved) return null;
    try {
      const sig = await this.submitter.settleRoom(room);
      this.store.markSettled(room.roomId);
      this.log.info("settled room", { room: room.roomId, sig });
      return { type: "settle", roomId: room.roomId, sig };
    } catch (e) {
      this.log.error("settle failed", { room: room.roomId, err: String(e) });
      return null;
    }
  }
}
