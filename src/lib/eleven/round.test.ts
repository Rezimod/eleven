import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createRoom,
  joinRoom,
  addMarket,
  predict,
  resolveMarket,
  playerPoints,
  standings,
  settle,
  marketPoints,
  type MarketSpec,
} from "./core.ts";
import { BOTS, botPick, isBot } from "../room/bots.ts";

/**
 * End-to-end: a solo free-play round vs 2 bots, covering a PRE-MATCH pick and a
 * LIVE-wave pick added mid-match. Exercises the exact core primitives the room
 * reducer composes — addMarket + predict (user + bots) + resolveMarket +
 * playerPoints + standings + settle — so a user's LIVE pick provably scores
 * through the same engine as a human's pre-match pick.
 */

const YOU = "You";
const ROOM = "900101-free";

function mkMarket(id: string, yesProb: number, lockTs: number, endTs: number): MarketSpec {
  const { yesPoints, noPoints } = marketPoints(yesProb);
  return {
    id,
    label: id,
    statKey: 1,
    period: 0,
    threshold: 0,
    comparison: "GreaterThan",
    lockTs,
    resolveDeadlineTs: endTs,
    yesPoints,
    noPoints,
  };
}

test("exactly two labeled free-play bots", () => {
  assert.equal(BOTS.length, 2);
  for (const b of BOTS) assert.ok(isBot(b));
  assert.ok(!isBot(YOU));
});

test("bot picks are odds-weighted and deterministic", () => {
  // Heavy favourite on `yes`: yesProb 0.9 → many more points on `no` (longshot),
  // so pYes = noPoints/(yesPoints+noPoints) is high → bots mostly back `yes`.
  const { yesPoints, noPoints } = marketPoints(0.9);
  let yes = 0;
  const N = 400;
  for (let i = 0; i < N; i++) {
    if (botPick(ROOM, `m-${i}`, "ByteStriker", yesPoints, noPoints) === "yes") yes++;
  }
  assert.ok(yes / N > 0.7, `expected bots to favour the likely side, got ${yes}/${N}`);
  // Deterministic: same inputs → same pick.
  assert.equal(
    botPick(ROOM, "m-1", "ByteStriker", yesPoints, noPoints),
    botPick(ROOM, "m-1", "ByteStriker", yesPoints, noPoints),
  );
});

test("solo vs 2 bots: pre-match + live picks score through one engine", () => {
  const lockTs = 1000;
  const liveLockTs = 2000;
  const endTs = 5000;

  // Free-play room (buyIn 0). Creator = You; both bots join.
  let room = createRoom({
    id: ROOM,
    fixtureId: 900101,
    creator: YOU,
    buyIn: 0,
    rakeBps: 500,
    maxPlayers: 8,
    joinDeadline: lockTs,
    endTs,
    refundDeadline: endTs + 3600,
    markets: [mkMarket("pre-nextgoal", 0.5, lockTs, endTs)],
  });
  for (const b of BOTS) room = joinRoom(room, b, 10);
  assert.equal(room.players.length, 3); // You + 2 bots

  // Pre-match: everyone picks before the lock.
  room = predict(room, YOU, "pre-nextgoal", "yes", 100);
  for (const b of BOTS) {
    const m = room.markets.find((x) => x.id === "pre-nextgoal")!;
    room = predict(room, b, "pre-nextgoal", botPick(ROOM, m.id, b, m.yesPoints, m.noPoints), 100);
  }

  // LIVE wave opens mid-match and is added to the SAME room (free-play).
  room = addMarket(room, mkMarket("live-goal-8m", 0.45, liveLockTs, endTs));
  // User taps a live pick in-window; bots pick weighted.
  room = predict(room, YOU, "live-goal-8m", "yes", 1500);
  for (const b of BOTS) {
    const m = room.markets.find((x) => x.id === "live-goal-8m")!;
    room = predict(room, b, "live-goal-8m", botPick(ROOM, m.id, b, m.yesPoints, m.noPoints), 1500);
  }

  // A tap after the live lock is rejected — lock windows are respected.
  assert.throws(() => predict(room, YOU, "live-goal-8m", "no", liveLockTs + 1), /locked/);

  // Resolve both markets YES from proven stats.
  room = resolveMarket(room, "pre-nextgoal", true);
  room = resolveMarket(room, "live-goal-8m", true);

  // The user backed `yes` on both → scores both markets' yesPoints.
  const preYes = marketPoints(0.5).yesPoints;
  const liveYes = marketPoints(0.45).yesPoints;
  assert.equal(playerPoints(room, YOU), preYes + liveYes);

  // Standings include the user + both bots; points are non-negative and the
  // user's total is exactly its two winning picks (live pick counted).
  const table = standings(room);
  assert.equal(table.length, 3);
  const you = table.find((s) => s.player === YOU)!;
  assert.equal(you.points, preYes + liveYes);

  // Free-play settle: pot 0, a winner is chosen, nobody is paid real value.
  const result = settle(room);
  assert.equal(result.pot, 0);
  assert.ok(result.winners.length >= 1);
  for (const p of result.payouts) assert.equal(p.amount, 0);
});
