import type { MatchClock, MatchEvent, MatchFeed, MatchStats, MatchSummary, Team } from "./types";

/**
 * TxlineFeed — the real feed. Talks to two server-side proxies that hold the
 * secret X-Api-Token (the browser can't send TxLINE's auth headers):
 *   - `/api/txline/fixtures` → the World Cup fixture list (real team names).
 *   - `/api/txline/stream`   → the live SSE `/api/scores/stream`.
 * Active when `NEXT_PUBLIC_FEED=live` and the token is set.
 *
 * The wire schema below is reconciled against a REAL devnet payload (see
 * `docs/txline-notes.md` §2): TxLINE sends PascalCase keys (`FixtureId`,
 * `Participant1IsHome`, `Clock`, `Stats`) with the per-event detail under `Data`
 * — not the camelCase `dataSoccer`/`scoreSoccer` the earlier docs implied. We
 * read PascalCase first and fall back to camelCase for resilience.
 */

// ── fixtures ──────────────────────────────────────────────────────────────

interface RawFixture {
  FixtureId: number;
  Competition?: string;
  Participant1?: string;
  Participant2?: string;
  Participant1IsHome?: boolean;
  StartTime?: number; // ms epoch
}

/** Derive a 3-letter code from a nation name ("Brazil" → "BRA"). */
function shortCode(name: string): string {
  return (name || "").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "?";
}

function kickoffLabel(startMs?: number): string {
  if (!startMs) return "TBD";
  return new Date(startMs).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fixtureToSummary(f: RawFixture): MatchSummary {
  const p1Home = f.Participant1IsHome ?? true;
  const home = (p1Home ? f.Participant1 : f.Participant2) ?? "Home";
  const away = (p1Home ? f.Participant2 : f.Participant1) ?? "Away";
  const now = Date.now();
  const start = f.StartTime ?? 0;
  const status: MatchSummary["status"] =
    start && now >= start && now < start + 2.5 * 3600_000
      ? "live"
      : start && now >= start
        ? "final"
        : "upcoming";
  return {
    fixtureId: f.FixtureId,
    competition: f.Competition ?? "World Cup",
    home,
    away,
    homeShort: shortCode(home),
    awayShort: shortCode(away),
    status,
    score: { home: 0, away: 0 },
    minute: 0,
    // The REAL kickoff — pre-match markets derive their lock (kickoff − 60s) from it.
    kickoffTs: start,
    kickoffLabel: status === "live" ? "LIVE" : kickoffLabel(f.StartTime),
  };
}

async function fetchFixtures(): Promise<RawFixture[]> {
  const res = await fetch("/api/txline/fixtures");
  if (!res.ok) return [];
  return (await res.json()) as RawFixture[];
}

// ── live SSE events ──────────────────────────────────────────────────────

interface RawScores {
  FixtureId?: number;
  fixtureId?: number;
  Participant1IsHome?: boolean;
  participant1IsHome?: boolean;
  Ts?: number;
  ts?: number;
  Action?: string;
  Clock?: { Running?: boolean; Seconds?: number };
  Data?: SoccerDetail;
  dataSoccer?: SoccerDetail;
  ScoreSoccer?: RawScore;
  scoreSoccer?: RawScore;
  /** `stats: Map_ScoreStatKey` — keyed context stats (txline-notes §2). */
  Stats?: Record<string, number>;
  stats?: Record<string, number>;
  Possession?: number;
  possession?: number;
}
interface SoccerDetail {
  Goal?: boolean;
  Corner?: boolean;
  YellowCard?: boolean;
  RedCard?: boolean;
  Minutes?: number;
  GoalType?: unknown;
  Participant?: number; // 1 | 2
}
interface RawScore {
  Participant1?: { Score?: number } | number;
  Participant2?: { Score?: number } | number;
}

function scoreOf(p: { Score?: number } | number | undefined): number {
  if (typeof p === "number") return p;
  return p?.Score ?? 0;
}

function teamFor(raw: RawScores, d: SoccerDetail | undefined): Team | undefined {
  const part = d?.Participant;
  if (part !== 1 && part !== 2) return undefined;
  const homeIsP1 = raw.Participant1IsHome ?? raw.participant1IsHome ?? true;
  return (part === 1) === homeIsP1 ? "home" : "away";
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * Best-effort read of the live context stats (DISPLAY-ONLY / TRIGGER-ONLY — a
 * market never settles on these). Reads the `stats` map + top-level `possession`;
 * momentum is derived from possession. Confirm the exact stat-map key IDs against
 * a live payload (see docs/DEMO.md) — unknown keys default to 0.
 */
export function parseStats(raw: RawScores): MatchStats | undefined {
  const map = raw.Stats ?? raw.stats;
  const poss = raw.Possession ?? raw.possession;
  if (!map && poss === undefined) return undefined;
  const g = (...keys: string[]) => keys.reduce((n, k) => n + Number(map?.[k] ?? 0), 0);
  const possessionHome = typeof poss === "number" ? clamp(poss, 0, 100) : 50;
  return {
    shots: g("Shots", "shots"),
    shotsOnTarget: g("ShotsOnTarget", "shotsOnTarget", "ShotsOnGoal"),
    possessionHome,
    attacks: g("Attacks", "attacks"),
    dangerousAttacks: g("DangerousAttacks", "dangerousAttacks"),
    momentum: clamp(Math.round((possessionHome - 50) * 2), -100, 100),
  };
}

/** Parse a raw TxLINE `Scores` record into a MatchEvent (or null to skip). */
export function parseScores(raw: RawScores): MatchEvent | null {
  const fixtureId = raw.FixtureId ?? raw.fixtureId ?? 0;
  const d = raw.Data ?? raw.dataSoccer;
  const sc = raw.ScoreSoccer ?? raw.scoreSoccer;
  const p1Home = raw.Participant1IsHome ?? raw.participant1IsHome ?? true;

  const minute = d?.Minutes ?? Math.floor((raw.Clock?.Seconds ?? 0) / 60);
  const clock: MatchClock = {
    minute,
    period: minute < 45 ? "1H" : "2H",
    running: raw.Clock?.Running ?? true,
  };
  const score = {
    home: scoreOf(p1Home ? sc?.Participant1 : sc?.Participant2),
    away: scoreOf(p1Home ? sc?.Participant2 : sc?.Participant1),
  };
  const ts = raw.Ts ?? raw.ts ?? Date.now();
  const base = { ts, fixtureId, minute, clock, score, stats: parseStats(raw) };

  if (d?.Goal) {
    return { id: crypto.randomUUID(), kind: "goal", team: teamFor(raw, d), goalType: goalTypeName(d.GoalType), ...base };
  }
  if (d?.Corner) return { id: crypto.randomUUID(), kind: "corner", team: teamFor(raw, d), ...base };
  if (d?.YellowCard) return { id: crypto.randomUUID(), kind: "card", card: "yellow", team: teamFor(raw, d), ...base };
  if (d?.RedCard) return { id: crypto.randomUUID(), kind: "card", card: "red", team: teamFor(raw, d), ...base };
  return { id: crypto.randomUUID(), kind: "clock", ...base };
}

function goalTypeName(g: unknown): string | undefined {
  if (g && typeof g === "object") return Object.keys(g)[0];
  return typeof g === "string" ? g : undefined;
}

export class TxlineFeed implements MatchFeed {
  readonly kind = "live" as const;

  async listMatches(): Promise<MatchSummary[]> {
    const fixtures = await fetchFixtures();
    return fixtures
      .map(fixtureToSummary)
      .sort((a, b) => (a.status === "live" ? -1 : 0) - (b.status === "live" ? -1 : 0));
  }

  async getMatch(fixtureId: number): Promise<MatchSummary | null> {
    if (!fixtureId) return null;
    const fixtures = await fetchFixtures();
    const f = fixtures.find((x) => x.FixtureId === fixtureId);
    return f ? fixtureToSummary(f) : null;
  }

  subscribe(fixtureId: number, onEvent: (e: MatchEvent) => void, opts?: { replay?: boolean }): () => void {
    const q = opts?.replay ? `?fixtureId=${fixtureId}&replay=1` : `?fixtureId=${fixtureId}`;
    const es = new EventSource(`/api/txline/stream${q}`);
    es.onmessage = (msg) => {
      try {
        const raw = JSON.parse(msg.data) as RawScores;
        const ev = parseScores(raw);
        if (ev) onEvent(ev);
      } catch {
        /* ignore heartbeats / non-JSON frames */
      }
    };
    es.onerror = () => {
      /* EventSource auto-reconnects; the proxy re-auths as needed */
    };
    return () => es.close();
  }
}
