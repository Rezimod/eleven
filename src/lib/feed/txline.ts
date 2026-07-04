import type { MatchClock, MatchEvent, MatchFeed, MatchSummary, Team } from "./types";

/**
 * TxlineFeed — the real feed. Connects to `/api/txline/stream` (our server-side
 * SSE proxy, which holds the secret X-Api-Token and forwards TxLINE's
 * `/api/scores/stream`). The browser can't set the auth headers itself, so the
 * proxy is the boundary. Active when `NEXT_PUBLIC_FEED=live` and the token is set.
 *
 * NOTE: the Scores → MatchEvent parser below is best-effort against the documented
 * SoccerData schema (docs/txline-notes.md). Exact field access (which participant
 * scored, the score object shape) must be confirmed against a live payload — that
 * needs a provisioned TXLINE_API_KEY. Marked TODO(live) where inferred.
 */

interface RawScores {
  fixtureId: number;
  participant1IsHome?: boolean;
  ts?: number;
  action?: string;
  dataSoccer?: {
    Goal?: boolean;
    Corner?: boolean;
    YellowCard?: boolean;
    RedCard?: boolean;
    Minutes?: number;
    GoalType?: unknown;
    Participant?: number; // 1 or 2
  };
  scoreSoccer?: {
    Participant1?: { Score?: number } | number;
    Participant2?: { Score?: number } | number;
  };
}

function scoreOf(p: { Score?: number } | number | undefined): number {
  if (typeof p === "number") return p;
  return p?.Score ?? 0;
}

function teamFor(raw: RawScores): Team | undefined {
  // TODO(live): confirm how the acting side is encoded. We infer from
  // dataSoccer.Participant (1|2) + participant1IsHome.
  const part = raw.dataSoccer?.Participant;
  if (part !== 1 && part !== 2) return undefined;
  const homeIsP1 = raw.participant1IsHome ?? true;
  const isP1 = part === 1;
  return isP1 === homeIsP1 ? "home" : "away";
}

/** Parse a raw TxLINE `Scores` record into a MatchEvent (or null to skip). */
export function parseScores(raw: RawScores): MatchEvent | null {
  const d = raw.dataSoccer;
  const minute = d?.Minutes ?? 0;
  const clock: MatchClock = {
    minute,
    period: minute < 45 ? "1H" : "2H",
    running: true,
  };
  const score = {
    home: scoreOf(raw.participant1IsHome ? raw.scoreSoccer?.Participant1 : raw.scoreSoccer?.Participant2),
    away: scoreOf(raw.participant1IsHome ? raw.scoreSoccer?.Participant2 : raw.scoreSoccer?.Participant1),
  };
  const base = { ts: raw.ts ? raw.ts * 1000 : Date.now(), fixtureId: raw.fixtureId, minute, clock, score };

  if (d?.Goal) {
    return { id: crypto.randomUUID(), kind: "goal", team: teamFor(raw), goalType: goalTypeName(d.GoalType), ...base };
  }
  if (d?.Corner) return { id: crypto.randomUUID(), kind: "corner", team: teamFor(raw), ...base };
  if (d?.YellowCard) return { id: crypto.randomUUID(), kind: "card", card: "yellow", team: teamFor(raw), ...base };
  if (d?.RedCard) return { id: crypto.randomUUID(), kind: "card", card: "red", team: teamFor(raw), ...base };
  return { id: crypto.randomUUID(), kind: "clock", ...base };
}

function goalTypeName(g: unknown): string | undefined {
  if (g && typeof g === "object") return Object.keys(g)[0];
  return typeof g === "string" ? g : undefined;
}

export class TxlineFeed implements MatchFeed {
  readonly kind = "live" as const;

  async listMatches(): Promise<MatchSummary[]> {
    // TODO(live): back with TxLINE schedule (/documentation/scores/schedule).
    // For now surface a single configured fixture so the live path is navigable.
    const id = Number(process.env.NEXT_PUBLIC_TXLINE_FIXTURE_ID ?? "0");
    if (!id) return [];
    const m = await this.getMatch(id);
    return m ? [m] : [];
  }

  async getMatch(fixtureId: number): Promise<MatchSummary | null> {
    if (!fixtureId) return null;
    return {
      fixtureId,
      competition: "World Cup (live)",
      home: "Home",
      away: "Away",
      homeShort: "HOM",
      awayShort: "AWY",
      status: "live",
      score: { home: 0, away: 0 },
      minute: 0,
      kickoffLabel: "LIVE",
    };
  }

  subscribe(fixtureId: number, onEvent: (e: MatchEvent) => void): () => void {
    const es = new EventSource(`/api/txline/stream?fixtureId=${fixtureId}`);
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
