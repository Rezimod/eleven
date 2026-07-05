import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createRoom,
  joinRoom,
  predict,
  resolveMarket,
  playerPoints,
  standings,
  winners,
  splitPot,
  settle,
  pointsFromOdds,
  marketPoints,
  allMarketsResolved,
  MAX_RAKE_BPS,
  type MarketSpec,
  type RoomConfig,
} from "./core.ts";

const T = { join: 1_000, lock: 2_000, resolve: 3_000, end: 4_000, refund: 5_000 };

function mkt(id: string, yesPoints: number, noPoints: number): MarketSpec {
  return {
    id,
    label: id,
    statKey: 1,
    period: 0,
    threshold: 0,
    comparison: "GreaterThan",
    lockTs: T.lock,
    resolveDeadlineTs: T.resolve,
    yesPoints,
    noPoints,
  };
}

function cfg(over: Partial<RoomConfig> = {}): RoomConfig {
  return {
    id: "r1",
    fixtureId: 42,
    creator: "alice",
    buyIn: 1_000,
    rakeBps: 500,
    maxPlayers: 8,
    joinDeadline: T.join,
    endTs: T.end,
    refundDeadline: T.refund,
    markets: [mkt("m0", 100, 50)],
    ...over,
  };
}

// ── odds → points ────────────────────────────────────────────────────────────

test("longer odds earn more points, monotonically, clamped", () => {
  assert.equal(pointsFromOdds(0.5), 100);
  assert.ok(pointsFromOdds(0.2) > pointsFromOdds(0.5), "underdog pays more");
  assert.ok(pointsFromOdds(0.8) < pointsFromOdds(0.5), "favourite pays less");
  assert.equal(pointsFromOdds(0.001), 1_000, "clamped to MAX");
  assert.ok(pointsFromOdds(0.999) >= 10, "clamped to MIN");
  const { yesPoints, noPoints } = marketPoints(0.5);
  assert.equal(yesPoints, noPoints);
});

// ── config guards ────────────────────────────────────────────────────────────

test("rake is capped at 10% and deadlines must be ordered", () => {
  assert.throws(() => createRoom(cfg({ rakeBps: MAX_RAKE_BPS + 1 })), /cap/);
  assert.throws(() => createRoom(cfg({ endTs: T.join - 1 })), /deadlines/);
  assert.doesNotThrow(() => createRoom(cfg({ rakeBps: MAX_RAKE_BPS })));
});

// ── lifecycle ────────────────────────────────────────────────────────────────

test("join enforces open/deadline/capacity/uniqueness", () => {
  let r = createRoom(cfg({ maxPlayers: 3 }));
  r = joinRoom(r, "bob", 500);
  assert.deepEqual(r.players, ["alice", "bob"]);
  const full = joinRoom(r, "carol", 500);
  assert.throws(() => joinRoom(full, "dave", 500), /full/);
  assert.throws(() => joinRoom(createRoom(cfg()), "bob", T.join + 1), /closed/);
  assert.throws(() => joinRoom(r, "bob", 500), /already/);
});

test("predictions are locked after lockTs and unique per market", () => {
  let r = joinRoom(createRoom(cfg()), "bob", 500);
  r = predict(r, "alice", "m0", "yes", 1_500);
  assert.throws(() => predict(r, "alice", "m0", "no", 1_500), /already predicted/);
  assert.throws(() => predict(r, "bob", "m0", "yes", T.lock + 1), /locked/);
  assert.throws(() => predict(r, "mallory", "m0", "yes", 1_500), /not a player/);
});

test("a market resolves exactly once", () => {
  let r = resolveMarket(createRoom(cfg()), "m0", true);
  assert.ok(allMarketsResolved(r));
  assert.throws(() => resolveMarket(r, "m0", false), /already resolved/);
});

// ── scoring ──────────────────────────────────────────────────────────────────

function scenario(buyIn = 1_000) {
  let r = createRoom(cfg({ buyIn, markets: [mkt("m0", 100, 50), mkt("m1", 60, 80)] }));
  r = joinRoom(r, "bob", 500);
  r = joinRoom(r, "carol", 500);
  r = predict(r, "alice", "m0", "yes", 1_500);
  r = predict(r, "alice", "m1", "yes", 1_500);
  r = predict(r, "bob", "m0", "yes", 1_500);
  r = predict(r, "bob", "m1", "no", 1_500);
  r = predict(r, "carol", "m0", "no", 1_500);
  r = resolveMarket(r, "m0", true); // yes
  r = resolveMarket(r, "m1", false); // no
  return r;
}

test("points come only from correct predictions, tallied across markets", () => {
  const r = scenario();
  assert.equal(playerPoints(r, "alice"), 100); // m0 yes ✓ (+100), m1 yes ✗ (0)
  assert.equal(playerPoints(r, "bob"), 180); // m0 yes ✓ (+100), m1 no ✓ (+80)
  assert.equal(playerPoints(r, "carol"), 0); // m0 no ✗
  assert.deepEqual(
    standings(r).map((s) => s.player),
    ["bob", "alice", "carol"],
  );
  assert.deepEqual(winners(r), ["bob"]);
});

test("winner takes pot minus rake", () => {
  const r = scenario();
  const s = settle(r);
  const pot = 1_000 * 3;
  const rake = Math.floor((pot * 500) / 10_000);
  assert.equal(s.pot, pot);
  assert.equal(s.rake, rake);
  assert.deepEqual(s.winners, ["bob"]);
  assert.equal(s.payouts[0].amount, pot - rake);
});

test("bigger buy-in yields NO extra points (stake never buys points)", () => {
  const free = scenario(0);
  const paid = scenario(5_000_000);
  for (const p of ["alice", "bob", "carol"]) {
    assert.equal(playerPoints(free, p), playerPoints(paid, p), `${p} points independent of buy-in`);
  }
  assert.deepEqual(winners(free), winners(paid));
});

test("ties split the pot equally, dust to first winners, pot conserved", () => {
  // alice & bob both correct on m0 → tie.
  let r = createRoom(cfg({ buyIn: 1_000, rakeBps: 500, markets: [mkt("m0", 100, 50)] }));
  r = joinRoom(r, "bob", 500);
  r = joinRoom(r, "carol", 500);
  r = predict(r, "alice", "m0", "yes", 1_500);
  r = predict(r, "bob", "m0", "yes", 1_500);
  r = predict(r, "carol", "m0", "no", 1_500);
  r = resolveMarket(r, "m0", true);

  const s = settle(r);
  assert.deepEqual(s.winners, ["alice", "bob"]);
  const paidToWinners = s.payouts.reduce((a, p) => a + p.amount, 0);
  assert.equal(paidToWinners + s.rake, s.pot, "pot fully conserved");
  const amounts = s.payouts.map((p) => p.amount).sort((a, b) => a - b);
  assert.ok(amounts[1] - amounts[0] <= 1, "shares differ by at most the dust");
});

test("splitPot: exact rake, cap enforced, conservation", () => {
  const { rake, perWinner, dust } = splitPot(3_000, 500, 2);
  assert.equal(rake, 150);
  assert.equal(perWinner * 2 + dust + rake, 3_000);
  assert.throws(() => splitPot(1_000, MAX_RAKE_BPS + 1, 1), /cap/);
});

test("scoring is deterministic across runs", () => {
  assert.deepEqual(standings(scenario()), standings(scenario()));
});
