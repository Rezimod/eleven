import type { Comparison, KeeperConfig, MarketWatch } from "./types.ts";

/**
 * On-chain `validate_stat` proof material. Mirrors `SettleArgs` from
 * `src/lib/txline/settlement.ts` and the `txline-settlement` crate 1:1 — EXCEPT
 * `predicate`, which `resolve_market` derives on-chain from the committed market
 * (so a caller can never substitute an easier claim). We carry it only for the
 * mock/receipt path.
 */
export interface ProofNode {
  hash: Uint8Array;
  isRightSibling: boolean;
}
export interface StatTerm {
  statToProve: { key: number; value: number; period: number };
  eventStatRoot: Uint8Array;
  statProof: ProofNode[];
}
export interface SettleArgs {
  targetTs: number;
  fixtureSummary: {
    fixtureId: number;
    updateStats: { updateCount: number; minTimestamp: number; maxTimestamp: number };
    eventStatsSubTreeRoot: Uint8Array;
  };
  fixtureProof: ProofNode[];
  mainTreeProof: ProofNode[];
  predicate: { threshold: number; comparison: Comparison };
  statA: StatTerm;
  statB: StatTerm | null;
  op: null;
}

// ── deterministic mock proof (sim feed) ─────────────────────────────────────

function bytes(seed: number): Uint8Array {
  const a = new Uint8Array(32);
  for (let i = 0; i < 32; i++) a[i] = (seed * 31 + i * 7) % 256;
  return a;
}
const node = (seed: number, right: boolean): ProofNode => ({ hash: bytes(seed), isRightSibling: right });

export function mockSettleArgs(fixtureId: number, targetTs: number, m: MarketWatch): SettleArgs {
  return {
    targetTs,
    fixtureSummary: {
      fixtureId,
      updateStats: { updateCount: 1, minTimestamp: targetTs - 60, maxTimestamp: targetTs },
      eventStatsSubTreeRoot: bytes(7),
    },
    fixtureProof: [node(11, true), node(12, false), node(13, true)],
    mainTreeProof: [node(21, false), node(22, true), node(23, false), node(24, true)],
    predicate: { threshold: m.threshold, comparison: m.comparison },
    statA: {
      statToProve: { key: m.statKey, value: m.threshold + 1, period: 0 },
      eventStatRoot: bytes(31),
      statProof: [node(41, true), node(42, false)],
    },
    statB: null,
    op: null,
  };
}

// ── live proof fetch (TxLINE /api/scores/stat-validation) ───────────────────

function toBytes32(s: string): Uint8Array {
  const isHex = /^(0x)?[0-9a-fA-F]{64}$/.test(s);
  const b = isHex
    ? Uint8Array.from((s.replace(/^0x/, "").match(/.{2}/g) ?? []).map((h) => parseInt(h, 16)))
    : Uint8Array.from(Buffer.from(s, "base64"));
  if (b.length !== 32) throw new Error(`expected 32-byte root, got ${b.length}`);
  return b;
}

interface RawNode {
  hash: string;
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
  statProof: RawNode[];
  subTreeProof: RawNode[];
  mainTreeProof: RawNode[];
}

async function guestJwt(origin: string): Promise<string> {
  const res = await fetch(`${origin}/auth/guest/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) throw new Error(`guest/start failed: HTTP ${res.status}`);
  return ((await res.json()) as { token: string }).token;
}

export async function fetchSettleArgs(
  cfg: KeeperConfig,
  params: { fixtureId: number; seq: number; statKey: number },
  m: MarketWatch,
): Promise<SettleArgs> {
  if (!cfg.txline) throw new Error("txline config missing for live proof fetch");
  const apiToken = process.env[cfg.txline.apiTokenEnv];
  if (!apiToken) throw new Error(`${cfg.txline.apiTokenEnv} not set`);
  const origin = cfg.txline.origin;
  const jwt = await guestJwt(origin);

  const url = new URL(`${origin}/api/scores/stat-validation`);
  url.searchParams.set("fixtureId", String(params.fixtureId));
  url.searchParams.set("seq", String(params.seq));
  url.searchParams.set("statKey", String(params.statKey));

  const res = await fetch(url, { headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken } });
  if (!res.ok) throw new Error(`stat-validation failed: HTTP ${res.status} ${await res.text().catch(() => "")}`);
  const v = (await res.json()) as RawValidation;
  const mapNode = (n: RawNode): ProofNode => ({ hash: toBytes32(n.hash), isRightSibling: n.isRightSibling });
  return {
    targetTs: v.ts,
    fixtureSummary: {
      fixtureId: v.summary.fixtureId,
      updateStats: v.summary.updateStats,
      eventStatsSubTreeRoot: toBytes32(v.summary.eventStatsSubTreeRoot),
    },
    fixtureProof: v.subTreeProof.map(mapNode),
    mainTreeProof: v.mainTreeProof.map(mapNode),
    predicate: { threshold: m.threshold, comparison: m.comparison },
    statA: {
      statToProve: v.statToProve,
      eventStatRoot: toBytes32(v.eventStatRoot),
      statProof: v.statProof.map(mapNode),
    },
    statB: null,
    op: null,
  };
}
