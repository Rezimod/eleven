# ELEVEN

Live-football micro-prediction game on Solana. Stake USDC on the next stat in a
running match (goal / corner / card), settled **cryptographically** against
TxODDS TxLINE's on-chain scores Merkle root — no trusted oracle operator.

Built for the **TxODDS World Cup Hackathon** (Superteam Earn) — "Prediction
Markets & Settlement" track.

## Stack

- **Web**: Next.js 15 (App Router) · TypeScript · Tailwind · (Privy + Supabase to come)
- **Chain**: Anchor program `eleven` (`anchor/`) — escrow + `settle_pool`
- **Data/oracle**: TxLINE SSE scores feed + TxOracle `validate_stat` Merkle proofs

## Layout

```
src/                         Next.js app
scripts/txline-probe.ts      SSE feed probe (proves the live pipeline)
anchor/                      Anchor workspace
  programs/eleven/           settle_pool program (CPIs validate_stat — TODO)
docs/txline.md               TxLINE auth / SSE schema / validate_stat notes
```

## TxLINE probe

Proves the World Cup SSE pipeline end-to-end (fetches a guest JWT, opens the
stream, prints the first live goal/corner/card event as JSON).

```bash
cp .env.example .env.local        # set TXLINE_API_KEY
npm run probe
```

The stream requires **both** a guest JWT (auto-fetched) and an `X-Api-Token`
(`TXLINE_API_KEY`). The API token is issued by `/api/token/activate` after a
one-time on-chain `subscribe` tx (free World Cup tier = 0 TxLINE tokens). Without
it the stream returns `403 "API Token not found."` — see `docs/txline.md`.

## Anchor program

```bash
cd anchor
anchor build                                  # compiles program + IDL
cargo test -p eleven --test test_settle_pool  # litesvm smoke test
```

`settle_pool` currently marks a pool settled behind a documented TODO: the real
path CPIs `validate_stat` on the TxOracle program
(`6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` devnet) to prove the pool's
predicate against the daily scores Merkle root before releasing USDC escrow.
