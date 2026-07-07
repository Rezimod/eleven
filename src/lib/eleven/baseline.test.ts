import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MarketGenerator,
  DEFAULT_TEMPLATES,
  DEFAULT_COMMIT_WINDOW_SEC,
  DEFAULT_BASELINE_TEMPLATES,
  DEFAULT_BASELINE_TARGET,
  DEFAULT_BASELINE_LOCK_SEC,
  DEFAULT_BASELINE_WINDOW_SEC,
  isProvableStat,
  emptyStats,
  type FixtureStats,
} from "./marketGenerator.ts";

/**
 * The rolling baseline guarantee: during live play there are ALWAYS 3–5 open,
 * bettable markets — even when no live-stat trigger ever fires. A player joining
 * mid-match immediately has something to bet.
 */

function makeGen() {
  return new MarketGenerator(
    {
      fixtureId: 900101,
      commitWindowSec: DEFAULT_COMMIT_WINDOW_SEC,
      templates: DEFAULT_TEMPLATES,
      baseline: {
        templates: DEFAULT_BASELINE_TEMPLATES,
        target: DEFAULT_BASELINE_TARGET,
        lockSec: DEFAULT_BASELINE_LOCK_SEC,
        windowSec: DEFAULT_BASELINE_WINDOW_SEC,
      },
    },
    emptyStats(),
  );
}

// Flat stats → deltas are always 0, so NO trigger template ever fires. Only the
// baseline keeps markets open, which is exactly the missing-stat-keys scenario.
function flatStats(sec: number): FixtureStats {
  return { ...emptyStats(), minute: Math.floor(sec / 60) };
}

test("live is never un-bettable — baseline holds >= target open every tick", () => {
  const gen = makeGen();
  const start = 1_000_000;
  let minOpen = Infinity;
  // 30 minutes of live play, one tick per second, no triggers ever firing.
  for (let sec = start; sec < start + 1800; sec++) {
    gen.update(flatStats(sec - start), sec);
    const open = gen.openForCommit().length;
    minOpen = Math.min(minOpen, open);
    assert.ok(open >= DEFAULT_BASELINE_TARGET, `only ${open} open at t=${sec - start}s`);
    assert.notEqual(open, 0);
  }
  assert.ok(minOpen >= DEFAULT_BASELINE_TARGET);
});

test("a mid-match joiner lands on open markets from the very first tick", () => {
  const gen = makeGen();
  // Join at minute 37 with a live scoreline — the first stats snapshot we ever see.
  const joinStats: FixtureStats = { ...emptyStats(), minute: 37, goals: 3, corners: 7 };
  const opened = gen.update(joinStats, 5_000_000).filter((e) => e.type === "open");
  assert.ok(opened.length >= DEFAULT_BASELINE_TARGET);
  assert.ok(gen.openForCommit().length >= DEFAULT_BASELINE_TARGET);
});

test("baseline markets are provable-only and roll over time", () => {
  const gen = makeGen();
  const start = 2_000_000;
  for (let sec = start; sec < start + 900; sec++) gen.update(flatStats(sec - start), sec);
  const all = gen.all();
  // Rolled many times over 15 minutes (far more than a single target's worth).
  assert.ok(all.length > DEFAULT_BASELINE_TARGET * 3, `only ${all.length} markets generated`);
  // EVERY generated market settles on a provable stat (goals/corners/cards).
  for (const gm of all) assert.ok(isProvableStat(gm.statKey), `non-provable stat ${gm.statKey}`);
});

test("stays bettable even as markets resolve early on crossing stats", () => {
  const gen = makeGen();
  const start = 4_000_000;
  // An eventful match: a goal or corner lands every ~15s, resolving live markets
  // YES before their locks. The baseline must still refill to target every tick.
  for (let sec = 0; sec < 900; sec++) {
    const stats: FixtureStats = {
      ...emptyStats(),
      minute: Math.floor(sec / 60),
      goals: Math.floor(sec / 45),
      corners: Math.floor(sec / 15),
    };
    gen.update(stats, start + sec);
    assert.ok(
      gen.openForCommit().length >= DEFAULT_BASELINE_TARGET,
      `only ${gen.openForCommit().length} open at t=${sec}s`,
    );
  }
});

test("open markets stay distinct — no duplicate open type at once", () => {
  const gen = makeGen();
  const start = 3_000_000;
  for (let sec = start; sec < start + 600; sec++) {
    gen.update(flatStats(sec - start), sec);
    const openIds = gen.openForCommit().map((m) => m.templateId);
    assert.equal(new Set(openIds).size, openIds.length, `duplicate open types: ${openIds}`);
  }
});
