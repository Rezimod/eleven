export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-side fixtures proxy for the live TxLINE feed.
 *
 * The browser can't send TxLINE's auth headers, so this route holds the secret
 * `TXLINE_API_KEY`, fetches a guest JWT, and reads `/api/fixtures/snapshot`
 * across the configured World Cup window, returning a de-duped fixture list the
 * client `TxlineFeed` maps into `MatchSummary`s. Only active when the token is
 * set — otherwise the app runs on the simulated feed.
 */
export async function GET() {
  const apiToken = process.env.TXLINE_API_KEY;
  if (!apiToken) {
    return new Response("TXLINE_API_KEY not set — app is running on the simulated feed", {
      status: 503,
    });
  }

  const origin = process.env.TXLINE_ORIGIN ?? "https://txline.txodds.com";
  const competitionId = process.env.TXLINE_COMPETITION_ID ?? "72"; // World Cup
  const startDay = Number(process.env.TXLINE_FIXTURES_START_EPOCHDAY ?? "20639");
  const days = Number(process.env.TXLINE_FIXTURES_DAYS ?? "5");

  const jwtRes = await fetch(`${origin}/auth/guest/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!jwtRes.ok) return new Response("guest jwt failed", { status: 502 });
  const { token } = (await jwtRes.json()) as { token: string };
  const headers = { Authorization: `Bearer ${token}`, "X-Api-Token": apiToken };

  // Union the WC window (one snapshot call per epoch day), de-duped by FixtureId.
  const byId = new Map<number, unknown>();
  let okCount = 0;
  let lastStatus = 0;
  await Promise.all(
    Array.from({ length: days }, (_, i) => startDay + i).map(async (day) => {
      const url = new URL(`${origin}/api/fixtures/snapshot`);
      url.searchParams.set("competitionId", competitionId);
      url.searchParams.set("startEpochDay", String(day));
      try {
        const r = await fetch(url, { headers });
        if (!r.ok) {
          lastStatus = r.status;
          return;
        }
        okCount++;
        const list = (await r.json()) as Array<{ FixtureId: number }>;
        for (const f of list) if (f?.FixtureId != null) byId.set(f.FixtureId, f);
      } catch {
        /* skip a bad day */
      }
    }),
  );

  // If every snapshot call failed, surface it instead of masquerading as "zero
  // fixtures" — a 403 here almost always means TXLINE_ORIGIN is unset so we hit
  // prod with a devnet token. Silent empty lists hid this in production.
  if (okCount === 0 && lastStatus !== 0) {
    return new Response(
      `TxLINE snapshot rejected all requests (last HTTP ${lastStatus}, origin ${origin}). ` +
        `Check TXLINE_ORIGIN (devnet token needs https://txline-dev.txodds.com) and TXLINE_API_KEY.`,
      { status: 502 },
    );
  }

  return Response.json([...byId.values()], {
    headers: { "Cache-Control": "no-store" },
  });
}
