import type { SettleArgs } from "./settlement";

/**
 * A verifiable-receipt view model derived from the on-chain settlement args.
 * The receipt is the judge signal: anyone can take these proof nodes + root and
 * re-derive that the outcome was verified against TxLINE's on-chain daily root.
 */
export interface ReceiptProof {
  targetTs: number;
  /** Fixture summary root (`eventStatsSubTreeRoot`), hex. */
  rootHex: string;
  /** Leaf hash (first fixture-proof node), hex. */
  leafHex: string;
  fixtureProofDepth: number;
  mainTreeProofDepth: number;
  /** True when rendered from a mock fixture (simulated feed). */
  mock: boolean;
}

function toHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function shortHex(h: string, n = 6): string {
  return h.length <= 2 * n ? h : `${h.slice(0, n)}…${h.slice(-n)}`;
}

export function settleArgsToReceiptProof(args: SettleArgs, mock = false): ReceiptProof {
  return {
    targetTs: Number(args.targetTs),
    rootHex: toHex(args.fixtureSummary.eventStatsSubTreeRoot),
    leafHex: args.fixtureProof[0] ? toHex(args.fixtureProof[0].hash) : "",
    fixtureProofDepth: args.fixtureProof.length,
    mainTreeProofDepth: args.mainTreeProof.length,
    mock,
  };
}
