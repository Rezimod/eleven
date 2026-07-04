# ELEVEN

Trustless live-football micro-prediction markets on Solana, **settled by TxLINE**.
Stake on the next stat in a running match (V1: next goal); the payout is released
only after an on-chain Merkle proof from TxODDS TxLINE verifies the outcome — no
trusted oracle operator, verifiable by anyone.

Built for the **TxODDS World Cup Hackathon** (Superteam Earn). Strategy &
three-track plan: **[docs/PLAYBOOK.md](docs/PLAYBOOK.md)**.

## Stack

- **Web**: Next.js 15 (App Router) · TypeScript · Tailwind · (Privy + Supabase to come)
- **Chain**: Anchor program `eleven` — escrow + `settle_pool`, built on the
  reusable `txline-settlement` crate
- **Data/oracle**: TxLINE SSE scores feed + TxOracle `validate_stat` Merkle proofs

## Layout

```
src/
  lib/txline/          TS settlement SDK: fetch proof → on-chain settle_pool args
  lib/eleven/          UI-agnostic core engine (pool / prediction / scoring)
scripts/txline-probe.ts  SSE feed probe (proves the live pipeline)
anchor/
  crates/txline-settlement/  REUSABLE settlement primitive (arg schema + CPI helper)
  programs/eleven/           the market: create_pool + settle_pool
  programs/mock-txoracle/    test double for TxOracle (deterministic tests)
docs/PLAYBOOK.md         strategy / positioning / submission plan
docs/txline-notes.md     TxLINE auth / SSE schema / validate_stat notes
```

## The settlement engine (flagship)

`settle_pool` takes the TxLINE proof bundle
(`target_ts, fixture_summary, fixture_proof, main_tree_proof, predicate`), CPIs
into the TxOracle `validate_stat` instruction to verify it against the on-chain
daily-scores Merkle root, and **only then** releases escrow. The verification +
CPI machinery lives in the reusable `txline-settlement` crate so any market can
drop it in. Program ids are pinned to the verified TxOracle addresses
(devnet `6pW64…wyP2J` / mainnet `9Exb…gcKaA`); the exact `validate_stat` account
list beyond `daily_scores_roots` is a documented `TODO(idl)` pending the public IDL.

```bash
cd anchor
anchor build                                  # builds both programs + IDLs
cargo test -p eleven --test test_settle_pool  # 6 tests: happy + 5 reject paths
```

The TS SDK mirror (`src/lib/txline`) fetches the proof from
`GET /api/scores/stat-validation` and maps it 1:1 onto the on-chain args.

## TxLINE probe

Proves the World Cup SSE pipeline end-to-end (fetches a guest JWT, opens the
stream, prints the first live goal/corner/card event as JSON).

```bash
cp .env.example .env.local        # set TXLINE_API_KEY
npm run probe
```

The stream requires **both** a guest JWT (auto-fetched) and an `X-Api-Token`
(`TXLINE_API_KEY`), issued by `/api/token/activate` after a one-time on-chain
`subscribe` tx (free World Cup tier = 0 TxLINE tokens). Without it the stream
returns `403 "API Token not found."` — see `docs/txline-notes.md`.

> V1 escrow is modeled as native lamports so the settlement gating is fully
> tested end-to-end without SPL/litesvm coupling; swapping to a USDC SPL transfer
> is a one-function change (see `docs/PLAYBOOK.md`).
