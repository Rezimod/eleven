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

/**
 * End-to-end: a PAID 3-player round covering a PRE-MATCH pick and a LIVE-wave
 * pick added mid-match. Exercises the exact core primitives the room reducer
 * composes — joinRoom (buy-in escrowed per player) + addMarket + predict +
 * resolveMarket + playerPoints + standings + settle — so a LIVE pick provably
 * scores through the same engine as a pre-match pick and the pot is paid from
 * buy-ins only.
 */

const YOU = "You";
const RIVALS = ["Alice", "Bela"];
const ROOM = "900101-low";
const BUY_IN = 50_000_000; // 0.05 SOL — rooms are paid-only, no free entry

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

test("paid 3-player round: pre-match + live picks score through one engine", () => {
  const lockTs = 1000;
  const liveLockTs = 2000;
  const endTs = 5000;

  // Paid room: creator = You pays the buy-in; both rivals pay the SAME buy-in.
  let room = createRoom({
    id: ROOM,
    fixtureId: 900101,
    creator: YOU,
    buyIn: BUY_IN,
    rakeBps: 500,
    maxPlayers: 8,
    joinDeadline: lockTs,
    endTs,
    refundDeadline: endTs + 3600,
    markets: [mkMarket("pre-nextgoal", 0.5, lockTs, endTs)],
  });
  for (const r of RIVALS) room = joinRoom(room, r, 10);
  assert.equal(room.players.length, 3); // You + 2 paid rivals

  // Pre-match: everyone picks before the lock. Rivals back the other side.
  room = predict(room, YOU, "pre-nextgoal", "yes", 100);
  for (const r of RIVALS) room = predict(room, r, "pre-nextgoal", "no", 100);

  // LIVE wave opens mid-match and is added to the SAME room.
  room = addMarket(room, mkMarket("live-goal-8m", 0.45, liveLockTs, endTs));
  room = predict(room, YOU, "live-goal-8m", "yes", 1500);
  for (const r of RIVALS) room = predict(room, r, "live-goal-8m", "no", 1500);

  // A tap after the live lock is rejected — lock windows are respected.
  assert.throws(() => predict(room, YOU, "live-goal-8m", "no", liveLockTs + 1), /locked/);

  // Resolve both markets YES from proven stats.
  room = resolveMarket(room, "pre-nextgoal", true);
  room = resolveMarket(room, "live-goal-8m", true);

  // The user backed `yes` on both → scores both markets' yesPoints.
  const preYes = marketPoints(0.5).yesPoints;
  const liveYes = marketPoints(0.45).yesPoints;
  assert.equal(playerPoints(room, YOU), preYes + liveYes);

  // Standings include all three paid players; your total is exactly the two
  // winning picks (live pick counted).
  const table = standings(room);
  assert.equal(table.length, 3);
  const you = table.find((s) => s.player === YOU)!;
  assert.equal(you.points, preYes + liveYes);

  // Paid settle: pot = 3 × buy-in; the sole winner takes pot − rake; rivals
  // (both wrong on both markets) take nothing. Stake never buys points.
  const result = settle(room);
  assert.equal(result.pot, 3 * BUY_IN);
  assert.deepEqual(result.winners, [YOU]);
  const rake = Math.floor((3 * BUY_IN * 500) / 10_000);
  assert.equal(result.rake, rake);
  assert.deepEqual(result.payouts, [{ player: YOU, amount: 3 * BUY_IN - rake }]);
});
