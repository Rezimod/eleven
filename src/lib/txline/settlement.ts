/**
 * txline-settlement (TS SDK) — the "drop-in settlement" client.
 *
 * Fetches a Merkle proof from TxLINE's `GET /api/scores/stat-validation` and
 * maps it 1:1 onto the on-chain `settle_pool` arguments (see the Rust crate
 * `anchor/crates/txline-settlement`). Any market can call `fetchSettleArgs()`
 * and hand the result straight to the Anchor instruction — settlement becomes a
 * one-liner, verifiable by anyone against the on-chain daily-scores root.
 *
 * Auth mirrors docs/txline-notes.md: guest JWT (Bearer) + X-Api-Token.
 */

// ── on-chain arg schema (mirrors txline_settlement::ValidateStatArgs) ─────────

export type Comparison = "GreaterThan" | "LessThan" | "Equal";

export interface ProofNode {
  hash: Uint8Array; // 32 bytes
  isRightSibling: boolean;
}

export interface ScoresUpdateStats {
  updateCount: number;
  minTimestamp: number | bigint;
  maxTimestamp: number | bigint;
}

export interface FixtureSummary {
  fixtureId: number;
  updateStats: ScoresUpdateStats;
  eventStatsSubTreeRoot: Uint8Array; // 32 bytes
}

export interface Predicate {
  /** IDL `TraderPredicate.threshold` (i32). */
  threshold: number | bigint;
  comparison: Comparison;
}

/** IDL `ScoreStat` — the proven stat leaf (`key` = stat kind, e.g. goals). */
export interface ScoreStat {
  key: number;
  value: number;
  period: number;
}

/** IDL `StatTerm` — a stat + its authentication path to the event sub-tree root. */
export interface StatTerm {
  statToProve: ScoreStat;
  eventStatRoot: Uint8Array; // 32 bytes
  statProof: ProofNode[];
}

export type BinaryExpression = "Add" | "Subtract";

/**
 * Exactly the arguments `eleven::settle_pool` expects, in TxOracle
 * `validate_stat` IDL order. `statB`/`op` are set only for two-stat predicates;
 * a single-stat market (e.g. "next goal") leaves them `null`.
 */
export interface SettleArgs {
  targetTs: number | bigint;
  fixtureSummary: FixtureSummary;
  fixtureProof: ProofNode[];
  mainTreeProof: ProofNode[];
  predicate: Predicate;
  statA: StatTerm;
  statB: StatTerm | null;
  op: BinaryExpression | null;
}

// ── raw API response (GET /api/scores/stat-validation, legacy mode) ───────────

interface RawProofNode {
  hash: string; // hex or base64, 32 bytes
  isRightSibling: boolean;
}
interface RawValidation {
  ts: number;
  statToProve: { key: number; value: number; period: number };
  eventStatRoot: string;
  summary: {
    fixtureId: number;
    updateStats: { updateCount: number; minTimestamp: number; maxTimestamp: number };
    eventStatsSubTreeRoot: string;
  };
  statProof: RawProofNode[];
  subTreeProof: RawProofNode[];
  mainTreeProof: RawProofNode[];
}

// ── config ────────────────────────────────────────────────────────────────

export interface TxlineConfig {
  /** e.g. https://txline.txodds.com (prod) or https://txline-dev.txodds.com */
  origin: string;
  /** X-Api-Token from /api/token/activate. */
  apiToken: string;
  /** Guest JWT; if omitted, `fetchSettleArgs` fetches one via /auth/guest/start. */
  jwt?: string;
}

// ── helpers ─────────────────────────────────────────────────────────────────

/** Decode a 32-byte value that TxLINE returns as hex or base64. */
export function toBytes32(s: string): Uint8Array {
  const isHex = /^(0x)?[0-9a-fA-F]{64}$/.test(s);
  const bytes = isHex
    ? Uint8Array.from((s.replace(/^0x/, "").match(/.{2}/g) ?? []).map((h) => parseInt(h, 16)))
    : Uint8Array.from(Buffer.from(s, "base64"));
  if (bytes.length !== 32) {
    throw new Error(`expected 32-byte root, got ${bytes.length} bytes from ${JSON.stringify(s)}`);
  }
  return bytes;
}

const mapNode = (n: RawProofNode): ProofNode => ({
  hash: toBytes32(n.hash),
  isRightSibling: n.isRightSibling,
});

/** Map a raw `/stat-validation` response + the market's predicate → on-chain args. */
export function mapValidationToSettleArgs(v: RawValidation, predicate: Predicate): SettleArgs {
  return {
    targetTs: v.ts,
    fixtureSummary: {
      fixtureId: v.summary.fixtureId,
      updateStats: {
        updateCount: v.summary.updateStats.updateCount,
        minTimestamp: v.summary.updateStats.minTimestamp,
        maxTimestamp: v.summary.updateStats.maxTimestamp,
      },
      eventStatsSubTreeRoot: toBytes32(v.summary.eventStatsSubTreeRoot),
    },
    fixtureProof: v.subTreeProof.map(mapNode), // leaf → fixture summary
    mainTreeProof: v.mainTreeProof.map(mapNode), // fixture summary → on-chain root
    predicate,
    statA: {
      statToProve: {
        key: v.statToProve.key,
        value: v.statToProve.value,
        period: v.statToProve.period,
      },
      eventStatRoot: toBytes32(v.eventStatRoot),
      statProof: v.statProof.map(mapNode),
    },
    statB: null, // single-stat "next goal" market
    op: null,
  };
}

/** Fetch a guest JWT (free, unauthenticated). */
export async function getGuestJwt(origin: string): Promise<string> {
  const res = await fetch(`${origin}/auth/guest/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) throw new Error(`guest/start failed: HTTP ${res.status}`);
  return ((await res.json()) as { token: string }).token;
}

/**
 * The flagship one-liner: fetch the proof for `(fixtureId, seq, statKey)` and
 * return arguments ready for `settle_pool`. `predicate` is the market's claim.
 */
export async function fetchSettleArgs(
  cfg: TxlineConfig,
  params: { fixtureId: number; seq: number; statKey: number },
  predicate: Predicate,
): Promise<SettleArgs> {
  const jwt = cfg.jwt ?? (await getGuestJwt(cfg.origin));
  const url = new URL(`${cfg.origin}/api/scores/stat-validation`);
  url.searchParams.set("fixtureId", String(params.fixtureId));
  url.searchParams.set("seq", String(params.seq));
  url.searchParams.set("statKey", String(params.statKey));

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": cfg.apiToken },
  });
  if (!res.ok) {
    throw new Error(`stat-validation failed: HTTP ${res.status} ${await res.text().catch(() => "")}`);
  }
  return mapValidationToSettleArgs((await res.json()) as RawValidation, predicate);
}
