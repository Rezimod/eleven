import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-side SSE proxy for the live TxLINE feed.
 *
 * The browser can't send TxLINE's auth headers, so this route holds the secret
 * `TXLINE_API_KEY`, fetches a guest JWT, opens `/api/scores/stream`, and pipes
 * the raw SSE straight through to the client's EventSource. Only active when the
 * token is set — otherwise the app runs on the simulated feed.
 */
export async function GET(req: NextRequest) {
  const apiToken = process.env.TXLINE_API_KEY;
  if (!apiToken) {
    return new Response("TXLINE_API_KEY not set — app is running on the simulated feed", {
      status: 503,
    });
  }

  const origin = process.env.TXLINE_ORIGIN ?? "https://txline.txodds.com";
  const fixtureId = req.nextUrl.searchParams.get("fixtureId");

  const jwtRes = await fetch(`${origin}/auth/guest/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!jwtRes.ok) return new Response("guest jwt failed", { status: 502 });
  const { token } = (await jwtRes.json()) as { token: string };

  const url = new URL(`${origin}/api/scores/stream`);
  if (fixtureId) url.searchParams.set("fixtureId", fixtureId);

  const upstream = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Api-Token": apiToken,
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
  if (!upstream.ok || !upstream.body) {
    const body = await upstream.text().catch(() => "");
    return new Response(`upstream stream ${upstream.status}: ${body}`, { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
