# TxLINE integration notes (ELEVEN)

Source: https://txline.txodds.com/documentation + OpenAPI `docs/docs.yaml`.
Servers: prod `https://txline.txodds.com`, dev `https://txline-dev.txodds.com`.

## 1. Auth — guest JWT + API token (two headers)

Every data call sends **both**:

- `Authorization: Bearer <JWT>` — guest session JWT (expires 30 days)
- `X-Api-Token: <apiToken>` — long-lived subscription token

Flow (docs "How do users gain access"):

1. (Paid tiers only) buy TxLINE tokens for USDT via `purchase_subscription_token_usdt`. **Skipped for the free World Cup tier.**
2. `POST /auth/guest/start` → `{ "token": "<JWT>" }`. Anonymous, no body. ✅ verified working.
3. On-chain: sign + confirm a `subscribe` tx (duration in multiples of 4 weeks, chosen service level). Free tier registers the subscription for **0 TxLINE tokens**. Record `txSig`.
4. Build a message binding `txSig + comma-separated leagues + JWT`, sign it with the wallet, Base64-encode → `walletSignature`.
5. `POST /api/token/activate` with `Authorization: Bearer <JWT>` and body `{ txSig, walletSignature, leagues:[...] }` → returns the API token (text/plain, e.g. `txoracle_api_123abc456def`).
6. Call data endpoints with both headers.

Free World Cup service levels: **SL1** (World Cup & Int'l friendlies, 60s delay) and **SL12** (real-time, mainnet only).

> Consequence for the probe: a guest JWT alone → `403 Missing API token`. A real API token requires the on-chain subscribe + activate. Verified: stream returns `403 "API Token not found."` without a valid token.

## 2. SSE match stream

`GET /api/scores/stream` (also `/api/odds/stream`). Headers: the two auth headers +
`Accept: text/event-stream`, `Cache-Control: no-cache` (optional `Accept-Encoding: gzip`).
Query: `fixtureId` (optional single-fixture filter). `Last-Event-ID` header resumes.

Two SSE frame types:
- **data message** — `id` = `"timestamp:index"`, `data` = one `Scores` JSON object.
- **heartbeat** — `event: heartbeat`, data like `{"Ts": 12345}`.

> **Verified against a live devnet payload (2026-07):** the wire keys are **PascalCase**,
> not the camelCase the field list below implies. A real frame looks like
> `{"FixtureId":18187298,"Participant1IsHome":true,"GameState":"scheduled",`
> `"Action":"players_warming_up","Clock":{"Running":false,"Seconds":0},"Data":{…},"Stats":{}}`.
> The per-event soccer detail is under **`Data`** (not `dataSoccer`); the score, when present,
> is under **`ScoreSoccer`**. `src/lib/feed/txline.ts` reads PascalCase first with a camelCase
> fallback. Team names + schedule come from `GET /api/fixtures/snapshot?competitionId=&startEpochDay=`
> (e.g. competition `72` = World Cup → Brazil v Norway, Portugal v Spain, …), proxied server-side
> by `/api/txline/fixtures` so the browser never sees the token.

### `Scores` (event payload) — soccer-relevant fields

```
fixtureId:int32  competitionId:int32  countryId:int32  sportId:int32
gameState:string  startTime:int64  ts:int64  seq:int32  id:int32  connectionId:int64
participant1Id/participant2Id:int32  participant1IsHome:bool
action:string                      # event type
statusSoccerId: SoccerFixtureStatus  (H1/HT/H2/ET1/ET2/P/END/…)
scoreSoccer: SoccerFixtureScore    # { Participant1: SoccerTotalScore, Participant2: SoccerTotalScore }
dataSoccer: SoccerData             # the per-event detail (below)
stats: Map_ScoreStatKey            # keyed stats used for validation
possession:int32  lineups:[LineupData]  kickoff:KickoffDetails
```

### `SoccerData` (the goal/corner/card detail)

```
Action:string  Type:string  Minutes:int32  Participant:int32  Outcome:string
Goal:bool  GoalType: Head|Shot|OwnGoal|Other  Penalty:bool
Corner:bool  YellowCard:bool  RedCard:bool  VAR:bool
FreeKickType:string  ThrowInType:string  Color:string
PlayerId / PlayerInId / PlayerOutId:int32   # subs & scorer
```

So a **goal** = `dataSoccer.Goal == true` (+ `GoalType`), a **corner** = `dataSoccer.Corner == true`, a **card** = `YellowCard`/`RedCard == true`. `scoreSoccer` carries the running score.

## 3. On-chain settlement — `validate_stat` + Merkle proofs

TxOracle program (single program, holds daily Merkle roots + validation ixs):
- **devnet** `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`
- **mainnet** `9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA`
- devnet token mints: TXLINE `4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG`, USDT `ELWTKspHKCnCfCiCiqYw1EDH77k8VCP74dK9qytG2Ujh`
- Instructions: `validate_stat`, `validate_fixture`, `validate_odds`.
- PDA seeds: `daily_scores_roots`, `daily_batch_roots`, `ten_daily_fixtures_roots`, `daily_resolution_roots`.

Three-level Merkle hierarchy: main batch → per-fixture sub-tree → per-event stat sub-tree.

### `validate_stat` accounts — RESOLVED against the official IDL

Vendored: [`anchor/idl/txoracle.json`](../anchor/idl/txoracle.json) (from `txodds/tx-on-chain`).
`validate_stat` takes **exactly one** account — the earlier "probably more accounts, order
unknown" TODO is closed:

- `daily_scores_merkle_roots` (read-only) — `findProgramAddressSync([b"daily_scores_roots", u16(epochDay).le(2)], programId)`

### `validate_stat` args (exact IDL order + types)

```
ts:              i64
fixture_summary: ScoresBatchSummary { fixture_id: i64, update_stats: ScoresUpdateStats{ update_count: i32, min_timestamp: i64, max_timestamp: i64 }, events_sub_tree_root: [u8;32] }
fixture_proof:   ProofNode[]                    // validation.subTreeProof
main_tree_proof: ProofNode[]                    // validation.mainTreeProof
predicate:       TraderPredicate { threshold: i32, comparison: GreaterThan|LessThan|EqualTo }
stat_a:          StatTerm { stat_to_prove: ScoreStat{ key: u32, value: i32, period: i32 }, event_stat_root: [u8;32], stat_proof: ProofNode[] }
stat_b:          Option<StatTerm>               // two-stat predicates (e.g. score diff); None for "next goal"
op:              Option<BinaryExpression>       // Add | Subtract; None for single-stat
```

`ProofNode` = `{ hash: [u8;32], is_right_sibling: bool }`. Discriminator
`[107,197,232,90,191,136,105,185]`. The Rust crate `anchor/crates/txline-settlement` and the
TS SDK `src/lib/txline` now mirror this 1:1 (previously `stat_a`/`stat_b`/`op` were missing and
`fixture_id`/`threshold`/`update_count` used the wrong widths — the CPI would have failed to
deserialize on the real oracle).

### Fetching proofs

`GET /api/scores/stat-validation?fixtureId=&seq=&statKey=[&statKey2=]` (legacy) →
`ScoresStatValidation`; V2 `?statKeys=a,b,c` → `ScoresStatValidationV2`. Response maps
straight into the CPI args:

```
validation.summary        → fixture_summary
validation.subTreeProof   → fixture_proof
validation.mainTreeProof  → main_tree_proof
validation.statToProve / eventStatRoot / statProof → stat1
```

Reference impl: https://github.com/txodds/tx-on-chain

## ELEVEN mapping

`eleven::settle_pool` (see `anchor/programs/eleven/src/instructions/settle_pool.rs`) CPIs
`validate_stat` on the TxOracle program with the `daily_scores_merkle_roots` PDA + the proof
args above to prove a pool's `{ stat_key, period, threshold, comparison }` predicate, then
release escrow. The IDL is now vendored (`anchor/idl/txoracle.json`) and the CPI arg/account
layout matches it exactly — the `TODO(idl)` is resolved and the 6 litesvm settlement tests pass.
