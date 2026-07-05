import type { Predicate, ProofNode, SettleArgs } from "./settlement";

/**
 * Deterministic mock of a `/api/scores/stat-validation` proof, so the verifiable
 * receipt renders end-to-end on the simulated feed (clearly marked MOCK in the
 * UI). On the live feed this is replaced by `fetchSettleArgs()` — same shape.
 */

function bytes(seed: number): Uint8Array {
  const a = new Uint8Array(32);
  for (let i = 0; i < 32; i++) a[i] = (seed * 31 + i * 7) % 256;
  return a;
}

function node(seed: number, right: boolean): ProofNode {
  return { hash: bytes(seed), isRightSibling: right };
}

export function mockSettleArgs(params: {
  fixtureId: number;
  targetTs: number;
  predicate: Predicate;
}): SettleArgs {
  return {
    targetTs: params.targetTs,
    fixtureSummary: {
      fixtureId: params.fixtureId,
      updateStats: {
        updateCount: 1,
        minTimestamp: params.targetTs - 60,
        maxTimestamp: params.targetTs,
      },
      eventStatsSubTreeRoot: bytes(7),
    },
    fixtureProof: [node(11, true), node(12, false), node(13, true)],
    mainTreeProof: [node(21, false), node(22, true), node(23, false), node(24, true)],
    predicate: params.predicate,
    statA: {
      statToProve: { key: 1, value: 1, period: 0 }, // goals
      eventStatRoot: bytes(31),
      statProof: [node(41, true), node(42, false)],
    },
    statB: null, // single-stat "next goal" market
    op: null,
  };
}
