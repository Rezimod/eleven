import type { Logger } from "./logger.ts";
import type { KeeperConfig, StreamEvent, StreamKind } from "./types.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nowSec = () => Math.floor(Date.now() / 1000);

// ── simulated stream (scripted ~5-min match, zero token) ────────────────────

interface Step {
  t: number;
  kind: StreamKind;
  team?: "home" | "away";
  card?: "yellow" | "red";
}

// Mirrors src/lib/feed/simulated.ts: 3–3 final, 6 corners, one red card.
const SCRIPT: Step[] = [
  { t: 1, kind: "corner", team: "home" },
  { t: 2, kind: "goal", team: "home" },
  { t: 3, kind: "card", team: "away", card: "yellow" },
  { t: 4, kind: "corner", team: "away" },
  { t: 5, kind: "goal", team: "away" },
  { t: 6, kind: "corner", team: "home" },
  { t: 7, kind: "goal", team: "home" },
  { t: 8, kind: "card", team: "away", card: "red" },
  { t: 9, kind: "corner", team: "home" },
  { t: 10, kind: "goal", team: "away" },
  { t: 11, kind: "corner", team: "away" },
  { t: 12, kind: "goal", team: "home" },
  { t: 13, kind: "corner", team: "home" },
  { t: 14, kind: "goal", team: "away" },
  { t: 15, kind: "fulltime" },
];

export async function* simStream(cfg: KeeperConfig): AsyncGenerator<StreamEvent> {
  const fixtures = [...new Set(cfg.rooms.map((r) => r.fixtureId))];
  const stepMs = 1000 / (cfg.simSpeed ?? 4);
  let seq = 0;
  for (const step of SCRIPT) {
    await sleep(stepMs);
    for (const fixtureId of fixtures) {
      yield { seq: ++seq, fixtureId, kind: step.kind, team: step.team, card: step.card, tsSec: nowSec() };
    }
  }
}

// ── live SSE stream (TxLINE /api/scores/stream) with resume + backoff ───────

interface RawScores {
  FixtureId?: number;
  fixtureId?: number;
  Participant1IsHome?: boolean;
  Data?: { Goal?: boolean; Corner?: boolean; YellowCard?: boolean; RedCard?: boolean; Participant?: number };
  Ts?: number;
}

function parse(raw: RawScores, seq: number): StreamEvent | null {
  const fixtureId = raw.FixtureId ?? raw.fixtureId ?? 0;
  if (!fixtureId) return null;
  const d = raw.Data;
  const tsSec = Math.floor((raw.Ts ?? Date.now()) / 1000);
  const homeIsP1 = raw.Participant1IsHome ?? true;
  const team = d?.Participant === 1 || d?.Participant === 2 ? ((d.Participant === 1) === homeIsP1 ? "home" : "away") : undefined;
  if (d?.Goal) return { seq, fixtureId, kind: "goal", team, tsSec };
  if (d?.Corner) return { seq, fixtureId, kind: "corner", team, tsSec };
  if (d?.YellowCard) return { seq, fixtureId, kind: "card", card: "yellow", team, tsSec };
  if (d?.RedCard) return { seq, fixtureId, kind: "card", card: "red", team, tsSec };
  return { seq, fixtureId, kind: "clock", tsSec };
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

/**
 * Live SSE with automatic resume: on any drop it reconnects with exponential
 * backoff, replaying from the last event id via the `Last-Event-ID` header so no
 * event is missed and none is double-counted (the keeper's state also dedupes).
 */
export async function* sseStream(cfg: KeeperConfig, fromSeq: number, log: Logger): AsyncGenerator<StreamEvent> {
  if (!cfg.txline) throw new Error("txline config missing for live stream");
  const apiToken = process.env[cfg.txline.apiTokenEnv];
  if (!apiToken) throw new Error(`${cfg.txline.apiTokenEnv} not set`);
  const origin = cfg.txline.origin;
  const fixtures = [...new Set(cfg.rooms.map((r) => r.fixtureId))];

  let lastId = fromSeq > 0 ? String(fromSeq) : "";
  let seq = fromSeq;
  let backoff = 1000;

  for (;;) {
    try {
      const jwt = await guestJwt(origin);
      const url = new URL(`${origin}/api/scores/stream`);
      if (fixtures.length === 1) url.searchParams.set("fixtureId", String(fixtures[0]));
      const headers: Record<string, string> = {
        Authorization: `Bearer ${jwt}`,
        "X-Api-Token": apiToken,
        Accept: "text/event-stream",
      };
      if (lastId) headers["Last-Event-ID"] = lastId;

      const res = await fetch(url, { headers });
      if (!res.ok || !res.body) throw new Error(`stream HTTP ${res.status}`);
      log.info("sse connected", { origin, lastId: lastId || null });
      backoff = 1000; // reset on a healthy connect

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n\n")) !== -1) {
          const frame = buf.slice(0, nl);
          buf = buf.slice(nl + 2);
          let data = "";
          for (const line of frame.split("\n")) {
            if (line.startsWith("id:")) lastId = line.slice(3).trim();
            else if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          if (!data) continue;
          try {
            const ev = parse(JSON.parse(data) as RawScores, /^\d+$/.test(lastId) ? Number(lastId) : ++seq);
            if (ev && fixtures.includes(ev.fixtureId)) yield ev;
          } catch {
            /* heartbeat / non-JSON frame */
          }
        }
      }
      throw new Error("stream closed by server");
    } catch (e) {
      log.warn("sse dropped — reconnecting", { err: String(e), backoffMs: backoff });
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 30_000);
    }
  }
}
