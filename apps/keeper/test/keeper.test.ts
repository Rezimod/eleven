import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Keeper, type Submitter } from "../src/keeper.ts";
import { KeeperStore } from "../src/state.ts";
import { silentLogger } from "../src/logger.ts";
import { mockSettleArgs, type SettleArgs } from "../src/proof.ts";
import type { Decision, MarketWatch, RoomWatch, StreamEvent } from "../src/types.ts";

function tmpState(): string {
  return join(mkdtempSync(join(tmpdir(), "keeper-")), "state.json");
}

class MockSubmitter implements Submitter {
  resolves: { room: string; index: number; kind: string }[] = [];
  settles: string[] = [];
  async resolveMarket(d: Decision): Promise<string> {
    this.resolves.push({ room: d.room.roomId, index: d.market.index, kind: d.kind });
    return "sig-resolve";
  }
  async settleRoom(room: RoomWatch): Promise<string> {
    this.settles.push(room.roomId);
    return "sig-settle";
  }
}

const proofFor = async (d: Decision): Promise<SettleArgs> => mockSettleArgs(d.room.fixtureId, d.targetTs, d.market);

const CORNERS: MarketWatch = { index: 0, kind: "cornersOver", statKey: 6, threshold: 2, comparison: "GreaterThan", label: "corners>2" };
const RED: MarketWatch = { index: 1, kind: "redCard", statKey: 8, threshold: 0, comparison: "GreaterThan", label: "red shown" };

const room = (markets: MarketWatch[]): RoomWatch => ({ roomId: "r1", fixtureId: 1, endTs: 9_000_000_000, markets });
const ev = (seq: number, kind: StreamEvent["kind"], extra: Partial<StreamEvent> = {}): StreamEvent => ({
  seq,
  fixtureId: 1,
  kind,
  tsSec: 1_000 + seq,
  ...extra,
});

test("resolves a market exactly once from a mock proof", async () => {
  const sub = new MockSubmitter();
  const k = new Keeper([room([CORNERS])], new KeeperStore(tmpState()), sub, proofFor, silentLogger);

  await k.onEvent(ev(1, "corner"));
  await k.onEvent(ev(2, "corner"));
  assert.equal(sub.resolves.length, 0, "corners=2 does not exceed threshold 2");

  await k.onEvent(ev(3, "corner")); // corners=3 > 2 → provable
  assert.equal(sub.resolves.length, 1);
  assert.deepEqual(sub.resolves[0], { room: "r1", index: 0, kind: "ProveYes" });

  await k.onEvent(ev(4, "corner")); // already resolved → no-op
  assert.equal(sub.resolves.length, 1, "never resolves the same market twice");
});

test("settles a room exactly once, only after every market is resolved", async () => {
  const sub = new MockSubmitter();
  const k = new Keeper([room([CORNERS, RED])], new KeeperStore(tmpState()), sub, proofFor, silentLogger);

  await k.onEvent(ev(1, "corner"));
  await k.onEvent(ev(2, "corner"));
  await k.onEvent(ev(3, "corner")); // corners resolved
  assert.equal(sub.settles.length, 0, "cannot settle with the red-card market unresolved");

  await k.onEvent(ev(4, "card", { card: "red" })); // red resolved
  await k.onEvent(ev(5, "fulltime")); // all resolved → settle
  assert.equal(sub.resolves.length, 2);
  assert.equal(sub.settles.length, 1);

  await k.onEvent(ev(6, "fulltime")); // idempotent
  assert.equal(sub.settles.length, 1, "never settles the same room twice");
});

test("ignores unprovable / edge events", async () => {
  const sub = new MockSubmitter();
  const k = new Keeper([room([CORNERS])], new KeeperStore(tmpState()), sub, proofFor, silentLogger);

  await k.onEvent(ev(1, "clock")); // heartbeat-ish tick
  await k.onEvent(ev(2, "kickoff"));
  await k.onEvent({ seq: 3, fixtureId: 999, kind: "corner", tsSec: 1_003 }); // unwatched fixture
  await k.onEvent(ev(4, "corner")); // corners=1, below threshold

  assert.equal(sub.resolves.length, 0);
  assert.equal(sub.settles.length, 0);
});

test("recovers after a simulated stream drop without double-resolving", async () => {
  const path = tmpState();

  const subA = new MockSubmitter();
  const kA = new Keeper([room([CORNERS])], new KeeperStore(path), subA, proofFor, silentLogger);
  await kA.onEvent(ev(1, "corner"));
  await kA.onEvent(ev(2, "corner"));
  await kA.onEvent(ev(3, "corner"));
  assert.equal(subA.resolves.length, 1);

  // Crash + restart: a fresh store/keeper load the persisted state from disk.
  const storeB = new KeeperStore(path);
  assert.equal(storeB.seq, 3, "resumes from the last processed seq (Last-Event-ID)");
  assert.ok(storeB.isResolved(KeeperStore.marketKey("r1", 0)), "remembers the resolved market");

  // A reconnect re-delivers the same events — must not re-resolve.
  const subB = new MockSubmitter();
  const kB = new Keeper([room([CORNERS])], storeB, subB, proofFor, silentLogger);
  await kB.onEvent(ev(1, "corner"));
  await kB.onEvent(ev(2, "corner"));
  await kB.onEvent(ev(3, "corner"));
  assert.equal(subB.resolves.length, 0, "persisted state prevents double-resolve across a crash");
});
