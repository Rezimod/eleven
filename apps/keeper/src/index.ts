import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Keeper, type ProofFor } from "./keeper.ts";
import { makeLogger } from "./logger.ts";
import { fetchSettleArgs, mockSettleArgs } from "./proof.ts";
import { KeeperStore } from "./state.ts";
import { LoggingSubmitter, makeSolanaSubmitter } from "./submitter.ts";
import { simStream, sseStream } from "./stream.ts";
import type { KeeperConfig } from "./types.ts";

const nowSec = () => Math.floor(Date.now() / 1000);

async function main() {
  const configPath = resolve(process.argv[2] ?? process.env.KEEPER_CONFIG ?? "keeper.config.sim.json");
  const cfg = JSON.parse(readFileSync(configPath, "utf8")) as KeeperConfig;
  const log = makeLogger({ svc: "eleven-keeper", feed: cfg.feed });
  log.info("starting", { configPath, rooms: cfg.rooms.length, broadcast: cfg.broadcast });

  const store = new KeeperStore(cfg.statePath);
  const submitter = cfg.broadcast ? await makeSolanaSubmitter(cfg, log) : new LoggingSubmitter(log);

  const proofFor: ProofFor = (d) =>
    cfg.feed === "sim"
      ? Promise.resolve(mockSettleArgs(d.room.fixtureId, d.targetTs, d.market))
      : fetchSettleArgs(cfg, { fixtureId: d.room.fixtureId, seq: d.seq, statKey: d.market.statKey }, d.market);

  const keeper = new Keeper(cfg.rooms, store, submitter, proofFor, log);

  // Wall-clock tick settles rooms whose deadline passed even if no full-time
  // event arrives (idempotent — safe to fire repeatedly).
  const ticker = setInterval(() => {
    keeper.tick(nowSec()).catch((e) => log.error("tick failed", { err: String(e) }));
  }, 5_000);

  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    clearInterval(ticker);
    log.info("shutting down", { lastSeq: store.seq });
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  const stream = cfg.feed === "sim" ? simStream(cfg) : sseStream(cfg, store.seq, log);
  for await (const ev of stream) {
    try {
      await keeper.onEvent(ev);
    } catch (e) {
      log.error("onEvent failed", { seq: ev.seq, err: String(e) });
    }
  }
  // Sim stream ends at full time; give the final settle a chance, then exit.
  await keeper.tick(nowSec());
  log.info("stream ended", { lastSeq: store.seq });
  shutdown();
}

main().catch((e) => {
  process.stderr.write(`fatal: ${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
