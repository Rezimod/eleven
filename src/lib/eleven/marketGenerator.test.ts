import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MarketGenerator,
  DEFAULT_TEMPLATES,
  MARKET_MENU,
  PROVABLE_STAT_KEYS,
  STAT_KEY,
  isProvableStat,
  buildMarket,
  emptyStats,
  type FixtureStats,
  type GenEvent,
  type GeneratorConfig,
  type MarketTemplate,
} from "./marketGenerator.ts";

function stats(over: Partial<FixtureStats> = {}): FixtureStats {
  return { ...emptyStats(), ...over };
}

function gen(templates = DEFAULT_TEMPLATES): MarketGenerator {
  const cfg: GeneratorConfig = { fixtureId: 900101, commitWindowSec: 20, templates };
  return new MarketGenerator(cfg, emptyStats());
}

const opens = (evs: GenEvent[]) => evs.filter((e) => e.type === "open").map((e) => e.market.templateId);

// ── triggers open the right markets from a scripted stat stream ────────────────

test("a corner streak opens exactly one 'over corners' market", () => {
  const g = gen();
  assert.deepEqual(opens(g.update(stats({ minute: 5, corners: 0 }), 0)), []);
  // +2 corners in a burst → corner-streak fires
  assert.deepEqual(opens(g.update(stats({ minute: 7, corners: 2 }), 10)), ["corner-streak"]);
  const m = g.live().find((x) => x.templateId === "corner-streak")!;
  assert.equal(m.statKey, STAT_KEY.CORNERS);
  assert.equal(m.spec.threshold, 3, "line = current corners + 1");
});

test("distinct context triggers open their mapped provable markets", () => {
  const g = gen();
  g.update(stats({ corners: 0 }), 0);
  // shots-on-target spike → goal market
  assert.deepEqual(opens(g.update(stats({ shotsOnTarget: 2 }), 10)), ["sot-goal"]);
  // dangerous-attacks spike → pressure goal market
  assert.deepEqual(opens(g.update(stats({ shotsOnTarget: 2, dangerousAttacks: 4 }), 20)), ["pressure-goal"]);
  // a red card with the game tense → another-card market
  assert.deepEqual(
    opens(g.update(stats({ shotsOnTarget: 2, dangerousAttacks: 4, redCards: 1, momentum: 70 }), 30)),
    ["card-tension"],
  );
});

// ── lifecycle: lock at the commit window, expire at the resolve deadline ───────

test("a market locks at its commit window and expires at its deadline", () => {
  const g = gen();
  g.update(stats({ corners: 2 }), 100); // corner-streak opens at 100, window 900s, lock at 120
  const m = g.live()[0];
  assert.equal(m.spec.lockTs, 120);
  assert.equal(m.spec.resolveDeadlineTs, 1000);

  let evs = g.update(stats({ corners: 2 }), 119);
  assert.equal(evs.length, 0, "still open for commit just before lock");
  assert.ok(g.openForCommit().length === 1);

  evs = g.update(stats({ corners: 2 }), 120);
  assert.deepEqual(evs.map((e) => e.type), ["lock"]);
  assert.equal(g.openForCommit().length, 0, "locked: no longer accepting commits");
  assert.equal(g.live().length, 1, "but still live until the deadline");

  evs = g.update(stats({ corners: 2 }), 1000);
  assert.deepEqual(evs.map((e) => e.type), ["expire"]);
  assert.equal(g.live().length, 0, "expired");
});

// ── HARD RULE: every generated market settles on a provable stat only ─────────

test("every generated market carries a PROVABLE settlement predicate", () => {
  const g = gen();
  // Drive a long scripted stream that fires all templates.
  const script: [FixtureStats, number][] = [
    [stats({ corners: 2 }), 10],
    [stats({ corners: 2, shotsOnTarget: 2 }), 20],
    [stats({ corners: 2, shotsOnTarget: 2, dangerousAttacks: 5 }), 40],
    [stats({ corners: 2, shotsOnTarget: 2, dangerousAttacks: 5, redCards: 1, momentum: 80 }), 60],
  ];
  for (const [s, t] of script) g.update(s, t);

  assert.ok(g.all().length >= 4, "all templates fired");
  for (const m of g.all()) {
    assert.ok(isProvableStat(m.statKey), `market ${m.templateId} settles on provable stat`);
    assert.ok(PROVABLE_STAT_KEYS.has(m.spec.statKey), `spec.statKey ${m.spec.statKey} is provable`);
    assert.ok([STAT_KEY.GOALS, STAT_KEY.CORNERS, STAT_KEY.RED_CARDS].includes(m.spec.statKey as 1 | 6 | 8));
  }
});

test("a template that tries to settle on a non-provable stat is rejected", () => {
  const NON_PROVABLE_SHOTS = 20;
  assert.ok(!isProvableStat(NON_PROVABLE_SHOTS));
  const bad: MarketTemplate = {
    id: "cheater",
    label: "settle on shots (illegal)",
    cooldownSec: 0,
    windowSec: 300,
    trigger: () => "always",
    predicate: (now) => ({
      statKey: NON_PROVABLE_SHOTS, // shots — NOT provable
      threshold: now.shots,
      comparison: "GreaterThan",
      yesProb: 0.5,
      title: "More shots?",
      yesLabel: "Yes",
      noLabel: "No",
    }),
  };
  const cfg: GeneratorConfig = { fixtureId: 1, commitWindowSec: 20, templates: [bad] };
  assert.throws(() => buildMarket(cfg, bad, emptyStats(), 0, "x"), /non-provable stat/);
  // And the running generator surfaces the throw rather than opening it.
  const g = new MarketGenerator(cfg, emptyStats());
  assert.throws(() => g.update(emptyStats(), 0), /non-provable stat/);
});

// ── the broad market menu: pre-match + live, ALL provable ─────────────────────

test("every menu market settles on a provable stat — none on shots/fouls/possession", () => {
  const NON_PROVABLE = { shots: 20, foulsMade: 21, possession: 22, shotsOnTarget: 23 };
  assert.ok(MARKET_MENU.length >= 8, "a broad menu");
  assert.ok(MARKET_MENU.some((m) => m.phase === "pre-match"), "has pre-match markets");
  assert.ok(MARKET_MENU.some((m) => m.phase === "live"), "has live markets");
  for (const m of MARKET_MENU) {
    assert.ok(isProvableStat(m.statKey), `menu "${m.id}" settles on a provable stat`);
    assert.ok(PROVABLE_STAT_KEYS.has(m.statKey));
    for (const nonProvable of Object.values(NON_PROVABLE)) {
      assert.notEqual(m.statKey, nonProvable, `menu "${m.id}" never settles on a non-provable stat`);
    }
  }
});

// ── no duplicates / cooldown ──────────────────────────────────────────────────

test("a template does not re-open while its market is still live", () => {
  const g = gen();
  assert.deepEqual(opens(g.update(stats({ corners: 2 }), 10)), ["corner-streak"]);
  // Another corner burst while the first is still live → no second market.
  assert.deepEqual(opens(g.update(stats({ corners: 4 }), 20)), []);
  assert.equal(g.live().filter((m) => m.templateId === "corner-streak").length, 1);
});

test("cooldown blocks an immediate re-fire after expiry", () => {
  const g = gen([
    { ...DEFAULT_TEMPLATES[2], cooldownSec: 300, windowSec: 100 }, // corner-streak, expires at open+100
  ]);
  g.update(stats({ corners: 2 }), 0); // open at 0, expires at 100
  g.update(stats({ corners: 2 }), 100); // expire
  assert.equal(g.live().length, 0);
  // Re-trigger at 150 (< cooldown 300 from the last fire at 0) → blocked.
  assert.deepEqual(opens(g.update(stats({ corners: 4 }), 150)), []);
  // After cooldown elapses → fires again.
  assert.deepEqual(opens(g.update(stats({ corners: 6 }), 400)), ["corner-streak"]);
});
