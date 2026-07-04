/**
 * TxLINE World Cup feed probe.
 *
 * Proves the live SSE pipeline end-to-end:
 *   1. POST /auth/guest/start            → guest JWT (free, unauthenticated)
 *   2. GET  /api/scores/stream           → SSE, with Bearer JWT + X-Api-Token
 *   3. parse events, print the first live match event (goal / corner / card /
 *      score change) as full JSON, then exit.
 *
 * Auth model (docs: /documentation/worldcup):
 *   The stream needs BOTH headers:
 *     Authorization: Bearer <guest JWT>   ← this script fetches it automatically
 *     X-Api-Token:   <API token>          ← process.env.TXLINE_API_KEY
 *   The API token is issued by /api/token/activate AFTER an on-chain `subscribe`
 *   tx (free World Cup tier = 0 TxLINE tokens). Without it the stream returns
 *   403 "Missing API token" — this script reports that clearly instead of hanging.
 *
 * Run:  TXLINE_API_KEY=... node scripts/txline-probe.ts
 *       (Node 24 runs .ts natively; or: npx tsx scripts/txline-probe.ts)
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

// --- minimal .env.local loader (no dependency) ------------------------------
try {
  const env = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  /* no .env.local — rely on real env */
}

const PROD = "https://txline.txodds.com";
const DEV = "https://txline-dev.txodds.com";
const ORIGIN = process.env.TXLINE_ORIGIN ?? PROD;
const API_TOKEN = process.env.TXLINE_API_KEY ?? "";
// Optional: filter to a specific World Cup competition id (the WC-tier stream
// only carries WC/friendly fixtures anyway).
const COMPETITION_ID = process.env.TXLINE_COMPETITION_ID
  ? Number(process.env.TXLINE_COMPETITION_ID)
  : undefined;
const TIMEOUT_MS = Number(process.env.TXLINE_PROBE_TIMEOUT_MS ?? 120_000);

type SoccerData = {
  Action?: string;
  Goal?: boolean;
  Corner?: boolean;
  RedCard?: boolean;
  YellowCard?: boolean;
  Penalty?: boolean;
  GoalType?: unknown;
  Minutes?: number;
  Participant?: number;
};
type Scores = {
  fixtureId?: number;
  competitionId?: number;
  gameState?: string;
  action?: string;
  ts?: number;
  seq?: number;
  participant1Id?: number;
  participant2Id?: number;
  scoreSoccer?: unknown;
  dataSoccer?: SoccerData;
};
type SseMessage = { id?: string; event?: string; data?: string };

function classify(s: Scores): string | null {
  const d = s.dataSoccer;
  if (d?.Goal) return "GOAL";
  if (d?.Corner) return "CORNER";
  if (d?.RedCard) return "RED_CARD";
  if (d?.YellowCard) return "YELLOW_CARD";
  if (d?.Penalty) return "PENALTY";
  // Fallback: a scores snapshot with soccer score data present.
  if (s.scoreSoccer && s.action) return `SCORE(${s.action})`;
  return null;
}

async function getGuestJwt(): Promise<string> {
  const res = await fetch(`${ORIGIN}/auth/guest/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) throw new Error(`guest/start failed: HTTP ${res.status} ${await res.text()}`);
  const { token } = (await res.json()) as { token: string };
  return token;
}

/** Parse an SSE byte stream into message objects. */
async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseMessage> {
  const decoder = new TextDecoder();
  let buf = "";
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    buf += decoder.decode(chunk, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const msg: SseMessage = {};
      const dataLines: string[] = [];
      for (const line of raw.split("\n")) {
        if (line.startsWith("id:")) msg.id = line.slice(3).trim();
        else if (line.startsWith("event:")) msg.event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length) msg.data = dataLines.join("\n");
      yield msg;
    }
  }
}

async function main() {
  console.log(`[probe] origin=${ORIGIN} (dev alt: ${DEV})`);
  if (!API_TOKEN) {
    console.warn(
      "[probe] WARNING: TXLINE_API_KEY is empty. The stream requires an X-Api-Token\n" +
        "         issued via /api/token/activate after an on-chain `subscribe` tx\n" +
        "         (free World Cup tier). Expect HTTP 403 'Missing API token'.",
    );
  }

  console.log("[probe] 1/2 fetching guest JWT …");
  const jwt = await getGuestJwt();
  console.log(`[probe]     got JWT (${jwt.slice(0, 12)}…, ${jwt.length} chars)`);

  const url = new URL(`${ORIGIN}/api/scores/stream`);
  console.log(`[probe] 2/2 connecting SSE ${url.pathname} …`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      "X-Api-Token": API_TOKEN,
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
    },
    signal: controller.signal,
  });

  if (!res.ok || !res.body) {
    clearTimeout(timer);
    const body = await res.text().catch(() => "");
    console.error(`\n[probe] STREAM REJECTED: HTTP ${res.status} — ${body.trim() || res.statusText}`);
    if (res.status === 403) {
      console.error(
        "[probe] → This is the auth wall, not a code bug. Provision an API token:\n" +
          "         subscribe (free WC tier) → sign → POST /api/token/activate → set TXLINE_API_KEY.",
      );
    }
    process.exit(1);
  }

  console.log("[probe]     stream open. Waiting for first live match event …\n");
  let heartbeats = 0;
  let others = 0;

  for await (const msg of readSse(res.body)) {
    if (msg.event === "heartbeat" || !msg.data) {
      heartbeats++;
      continue;
    }
    let scores: Scores;
    try {
      scores = JSON.parse(msg.data) as Scores;
    } catch {
      continue;
    }
    if (COMPETITION_ID !== undefined && scores.competitionId !== COMPETITION_ID) {
      others++;
      continue;
    }
    const kind = classify(scores);
    if (!kind) {
      others++;
      continue;
    }

    clearTimeout(timer);
    console.log(`✅ LIVE EVENT: ${kind}  (fixture ${scores.fixtureId}, seq ${scores.seq})`);
    console.log(`   after ${heartbeats} heartbeat(s), ${others} non-scoring update(s)\n`);
    console.log("── SSE envelope ──");
    console.log(JSON.stringify({ id: msg.id, event: msg.event ?? "message" }, null, 2));
    console.log("\n── data (full Scores JSON) ──");
    console.log(JSON.stringify(scores, null, 2));
    process.exit(0);
  }

  clearTimeout(timer);
  console.error(
    `\n[probe] Stream ended / timed out after ${TIMEOUT_MS}ms without a scoring event ` +
      `(${heartbeats} heartbeats, ${others} other updates). No live match in window?`,
  );
  process.exit(2);
}

main().catch((err) => {
  console.error(`[probe] ERROR: ${err?.message ?? err}`);
  process.exit(1);
});
