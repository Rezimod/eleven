# ELEVEN — Settlement Keeper

The autonomous agent that makes matches self-run. It watches the TxLINE match
stream, and the instant a market's provable condition is decided it fetches the
Merkle proof and submits `resolve_market` on-chain — no human input. At full time
it submits `settle_room`, paying the winner minus rake. This is ELEVEN's **Trading
Tools & Agents** track entry.

## What it does

```
TxLINE SSE stream ──▶ Watcher ──▶ Proof fetch ──▶ resolve_market (validate_stat CPI)
   (goals/corners/cards)   │                              │
                           └── at full time ─────────────▶ settle_room (pays winner − rake)
```

Every market it watches is a **monotone provable predicate** over a stat TxLINE
proves — team-goals-over-N, corners-over-N, red-card-shown. This maps 1:1 onto the
program's two resolution paths:

- the instant the predicate crosses **true**, it is proven on-chain → `resolve_market{ProveYes}` with a real `validate_stat` Merkle proof;
- if it never crosses by the deadline → `resolve_market{TimeoutNo}` (public timeout, no operator asserts the result).

`resolve_market` derives the predicate from the **committed** market on-chain, so
the keeper supplies proof material only — it can never substitute an easier claim.

## Architecture

| module | responsibility |
|---|---|
| `src/stream.ts` | `simStream` (scripted, zero-token) and `sseStream` (live TxLINE SSE) with **Last-Event-ID resume + exponential backoff reconnect** |
| `src/watcher.ts` | pure tally + predicate evaluation (`isTrue`) — no side effects |
| `src/proof.ts` | build `validate_stat` args: `mockSettleArgs` (sim) or `fetchSettleArgs` (live `/api/scores/stat-validation`) — mirrors `src/lib/txline` + the `txline-settlement` crate |
| `src/keeper.ts` | the orchestrator: consume events → resolve decided markets → settle at deadline, **idempotent** via persistent state |
| `src/state.ts` | crash-safe store (atomic temp-write + rename); `resolved`/`settled` sets + `lastSeq` |
| `src/submitter.ts` | `LoggingSubmitter` (dry-run) and `makeSolanaSubmitter` (real web3.js + Anchor IDL) |
| `src/index.ts` | CLI: load config → wire stream/proof/submitter → run loop + wall-clock settle tick + graceful shutdown |

### Crash-safe & idempotent

State is flushed to disk (atomically) after **every** committed resolve/settle. A
market is marked resolved only *after* its tx confirms, so a crash mid-flight
retries rather than skips. On restart the `resolved`/`settled` sets guarantee it
**never double-resolves or double-settles**, and `lastSeq` resumes the stream via
`Last-Event-ID`. Re-delivered events on reconnect are deduped by the same state.

## Run it

### Simulated (demo, no token, no chain)

```bash
cd apps/keeper
node src/index.ts keeper.config.sim.json
```

Replays a scripted 3–3 match; you'll see three markets resolve `ProveYes` (corners,
red card, home goals) and one resolve `TimeoutNo` (away goals over 5 never
happens), then the room settle — all as structured JSON logs. Re-running is a
no-op (state is persisted).

### Live (real feed + on-chain broadcast)

```bash
cd apps/keeper
cp keeper.config.example.json keeper.config.live.json   # fill in roomPda, treasury, PDAs
export TXLINE_API_KEY=…                                  # never commit this
node src/index.ts keeper.config.live.json
```

Requires: the `eleven` program deployed, a funded keeper keypair (`keypairPath`),
the TxOracle `daily_scores_merkle_roots` PDA, and rooms that exist on-chain with
revealed predictions. `@solana/web3.js` + `@coral-xyz/anchor` install as optional
deps; the sim/test path needs neither.

## Tests

```bash
npm test          # node --test test/*.test.ts
```

- **resolves a market exactly once** from a mock proof (idempotent)
- **settles a room exactly once**, only after every market is resolved
- **ignores unprovable / edge events** (heartbeats, unwatched fixtures, below-threshold)
- **recovers after a simulated stream drop** without double-resolving (persisted state)

## Config

See `keeper.config.sim.json` (sim) and `keeper.config.example.json` (live). Each
room lists its `fixtureId`, `endTs`, and the markets to watch (`index`, `kind`,
`statKey`, `threshold`, `comparison`). `broadcast: false` = dry-run.
