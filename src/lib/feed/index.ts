import type { MatchFeed } from "./types";
import { SimulatedFeed } from "./simulated";
import { TxlineFeed } from "./txline";

export * from "./types";
export { SimulatedFeed } from "./simulated";
export { TxlineFeed } from "./txline";

/** Which feed the app is running on, from `NEXT_PUBLIC_FEED` (defaults to sim). */
export function feedMode(): "sim" | "live" {
  return process.env.NEXT_PUBLIC_FEED === "live" ? "live" : "sim";
}

let cached: MatchFeed | null = null;

/** The single feed the whole app talks to. Sim by default → zero-token demo. */
export function getFeed(): MatchFeed {
  if (cached) return cached;
  cached = feedMode() === "live" ? new TxlineFeed() : new SimulatedFeed();
  return cached;
}
