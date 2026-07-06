# ELEVEN — Playbook

> Source-of-truth strategy doc. If you're building or pitching ELEVEN, read this first.
> Companion: [`docs/txline-notes.md`](./txline-notes.md) — TxLINE auth, SSE Scores/SoccerData schema, `validate_stat` + Merkle proof mechanics. This doc does not repeat those; it consumes them.

---

## 1. Positioning

# ELEVEN — trustless live-sports prediction markets on Solana, settled by TxLINE.

**The pitch is the settlement primitive, not the game.** The football game is the demo skin. What we're actually shipping is a way to settle a prediction market on-chain with no trusted operator in the loop — the outcome is proven against TxLINE's signed daily-scores Merkle root before a single lamport of escrow moves.

> "Every other market asks you to trust an oracle. ELEVEN settles straight from TxLINE's signed Merkle proofs on-chain — the payout is verifiable by anyone, live."

**Why trustless settlement is the wedge.** Every prediction market alive today has the same soft center: a trusted oracle operator (a multisig, a committee, a UMA-style dispute game) decides what happened, and users have to trust that decision. That trust is the attack surface, the dispute surface, and the reason settlements are slow. ELEVEN removes the operator: settlement is a CPI into TxLINE's on-chain `validate_stat`, which checks the outcome against a signed Merkle root TxLINE has already committed on-chain. Nobody "reports" the result to us — we prove it. That means payouts are instant, censorship-resistant, and independently verifiable by anyone with the proof, which is exactly the property a serious markets primitive needs and today's oracles can't offer.

---

## 2. Three-track plan

**One build. Three submissions.** The same codebase, framed three ways for three Superteam tracks. We do not fork the product — we spotlight different existing features per track.

### 2a. Prediction Markets & Settlement — $18K (PRIMARY)

**Angle:** ELEVEN is trustless settlement infrastructure — a reusable SDK that any Solana market can drop in to settle from TxLINE proofs, with verifiable payout receipts.

**Spotlight:** the Anchor settlement module, the CPI into `validate_stat`, the `lib/txline` SDK, the verifiable-receipt UI.

- Settlement is a CPI into TxLINE's on-chain program — the proof, not an operator, releases escrow. No trusted reporter anywhere in the flow.
- We ship a thin, reusable **settlement SDK**: fetch proof → map 1:1 to on-chain args → settle. Any market on Solana can adopt it.
- Every payout emits a **verifiable receipt**: anyone can re-derive the outcome from the Merkle proof and confirm the payout was correct. Auditability is a product feature, not a promise.

### 2b. Consumer & Fan — $16K

**Angle:** The most alive way to watch football — predict the next goal while the match is live, free, in seconds.

**Spotlight:** the free-play hero experience, live in-match prediction UI, the SSE-driven live state.

- **Free-play first.** No wallet, no money, no friction — you're predicting within one tap of landing.
- **Live in-match dopamine.** Predict the next goal while the match is actually playing; the SSE stream resolves it in real time on your screen.
- **Fan engagement loop.** Fast rounds, instant resolution, and a shareable receipt when you nail it — built for second-screen match-watching.

### 2c. Trading Tools & Agents — $16K

**Angle:** An autonomous settlement agent — the keeper bot that settles markets on-chain with zero human input.

**Spotlight:** the settlement keeper bot, the TxLINE SSE listener, the proof-fetch-and-execute pipeline.

- The **keeper is an autonomous agent**: it watches the TxLINE SSE stream and detects the moment a market's outcome resolves.
- On resolution it **fetches the Merkle proof** from `/api/scores/stat-validation` and **executes the on-chain settlement** itself — no operator, no button to press.
- It's the automation layer that makes trustless settlement actually run at scale: markets close and pay out on their own, provably.

---

## 3. V1 scope — room-based, multi-event, provably fair

**Principle: a fair game over provable outcomes.** ELEVEN is a **room** game: players join a fixed buy-in tournament over one fixture and predict a slip of provable markets. Fairness and on-chain security are the #1 priority — this handles user funds. We win on settlement being genuinely trustless, genuinely verifiable, and genuinely fair (no pay-to-win).

**IN scope for V1:**

- **Room-based fixed buy-in.** A creator opens a room with a fixed buy-in tier + a capped rake; others join paying the *same* buy-in (poker-tournament fairness). Min 2 players; joins close before the first market locks. Free-play rooms = buy-in 0 (points only, no escrow) on the same scoring engine.
- **Provable markets only.** Every market is a `validate_stat` predicate over a stat TxLINE proves — goals, corners, cards. Supported: "next goal: team", "total corners over N", "next card is red", "Team A goals > Team B" (two-stat). Non-provable stats (fouls, shots, throw-ins) are explicitly excluded.
- **Points from skill, not stake.** Everyone starts at 0; points come *only* from correct, revealed predictions, scaled by each market's odds (longer odds → more points). Stake never buys points. Winner = most points at full time → takes the pot minus rake; ties split equally; rake → treasury.
- **Real `validate_stat` settlement.** `resolve_market` CPIs into the TxOracle program and verifies the Merkle proof against the on-chain daily-scores root before any market resolves `yes`. `no` resolves by public timeout.
- **Verifiable-receipt UI.** Every resolved market shows a receipt anyone can re-derive from the proof.

**OUT of scope for V1 (explicitly):**

- Non-provable markets (fouls, shots, possession, throw-ins) — nothing TxLINE can't prove.
- Order books / AMM pricing. Points scale off odds (TxLINE consensus where available, else a fixed table), not a live market maker.
- Seasons, social graph, profiles, cross-room leaderboards.
- Multi-sport or multi-league. One fixture per room.
- Mainnet at scale — V1 targets a clean, demoable devnet loop.

---

## 4. Demo spine

**Record the 5-minute demo on a REAL World Cup knockout match** — live window **Jul 14–17**. Real match, real stream, real settlement. No mocks on camera.

**On-camera arc:**

1. **Free-play** — land, no wallet, predict the next goal in one tap. Show the loop is instant and alive.
2. **Live prediction on the next goal** — enter the real USDC pool, place a prediction while the match is actually playing, SSE state ticking live.
3. **Merkle-verified on-chain settlement** — a goal happens; the outcome resolves; the keeper fetches the proof and the CPI into `validate_stat` verifies it against the on-chain root.
4. **Payout, resolving live** — escrow releases and the payout lands on screen, in real time.

**Non-negotiable:** the demo must **show the verifiable receipt / proof being checked** — pull up the receipt, re-derive the payout from the Merkle proof on camera, and show it matches. The "anyone can verify" claim has to be demonstrated, not asserted.

---

## 5. Submission fields + copy

### Title

> **ELEVEN — trustless live-sports prediction markets on Solana, settled by TxLINE**

### Briefly explain what you built (~100–150 words)

> ELEVEN is a live-football micro-prediction game whose real product is its settlement primitive. Players predict the next goal during a live match — free to play, or in a real USDC pool. What makes it different is how it settles: instead of trusting an oracle operator to report the result, ELEVEN settles on-chain by CPI into TxLINE's TxOracle `validate_stat` instruction, verifying the outcome against TxLINE's signed daily-scores Merkle root before any escrow is released. An autonomous keeper agent watches the TxLINE SSE stream, detects resolution, fetches the Merkle proof, and executes settlement with zero manual input. Every payout produces a verifiable receipt anyone can independently re-derive from the proof. Built on Next.js 15, Privy, Supabase, and Anchor, ELEVEN is a reusable trustless-settlement layer wearing a football game as its demo.

### TxLINE feedback

> The two-header auth (guest JWT + API token) was clear and easy to wire up. The SSE Scores/SoccerData schema is rich — plenty of live signal to build real-time UX on. The stat-validation proof endpoint maps cleanly onto the on-chain `validate_stat` args, which made the settlement path straightforward to reason about. The one gap: the exact `validate_stat` account list / IDL isn't in the public docs yet, so we had to infer account ordering — publishing the program IDL would remove the last bit of guesswork and speed up integrations like ours.

### Link fields checklist

- [ ] **MVP link:** `TODO:`
- [ ] **Demo video:** `TODO:`
- [ ] **Repo:** `TODO:`
- [ ] **Tech doc:** `TODO:`
- [ ] **X/Twitter post:** `TODO:`

---

## 6. Timeline

Deadline is hard: **2026-07-19 23:59 UTC.** We front-load so the last 48 hours are buffer, not scramble.

- **Jul 14 — MVP feature-complete.** One event type, free-play + one real USDC pool, real `validate_stat` settlement, verifiable-receipt UI all working end to end.
- **Jul 15 — Private real-match test.** Run the full loop against a live knockout match, real proofs, real settlement. Fix what breaks under real stream conditions.
- **Jul 16 — Record demo.** Capture the 5-minute arc on a real match (knockout window Jul 14–17), including the on-camera receipt verification.
- **Jul 17 — Submit to all 3 tracks.** Prediction Markets ($18K, primary), Consumer & Fan ($16K), Trading Tools & Agents ($16K), each with tailored copy from §5.
- **Jul 18–19 — Buffer.** Two full days of slack for a re-shoot, a broken settlement edge case, or a match that doesn't cooperate.

**Buffer rationale:** live sports is the one dependency we don't control — a match can go 0-0, a stream can hiccup, a settlement can hit an unexpected account-ordering issue. Submitting on the 17th with 48+ hours of runway means any of those is recoverable instead of fatal.

---

## 7. Stretch

**Telegram Mini App wrapper** — post-hackathon, or pulled forward if we're ahead of schedule.

The prediction/scoring engine (`lib/eleven`) is being kept **deliberately UI-agnostic** for exactly this reason: no React, no DOM, no web-only assumptions in the core. When we wrap it in a TMA, the entire loop — predict, resolve, settle, receipt — reuses the same engine, and only the presentation layer changes. Web now, Telegram later, zero core rewrite.

---

## 8. Architecture note

How this strategy maps onto the repo:

- **Reusable Anchor settlement module** — the on-chain program that escrows and releases via CPI into TxOracle's `validate_stat`. Ships with **`mock-txoracle`** for local/CI tests so we don't depend on a live match to test settlement.
- **Thin TS settlement SDK (`lib/txline`)** — fetches Merkle proofs from `/api/scores/stat-validation` and maps them **1:1** onto the on-chain `validate_stat` args. This is the reusable piece we pitch for the Settlement track.
- **UI-agnostic core engine (`lib/eleven`)** — pure room lifecycle + multi-event scoring (odds→points, tally, winner, tie-split, pot/rake split), shared by **web-now** and **TMA-later**. No UI assumptions; mirrors the on-chain math 1:1; 11 `node --test` unit tests.
- **On-chain program IDs are pinned to the verified TxOracle addresses:** devnet `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`, mainnet `9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA`. The TxOracle IDL is **vendored** (`anchor/idl/txoracle.json`, from `txodds/tx-on-chain`): `validate_stat` takes exactly one account (`daily_scores_merkle_roots`) and eight positional args. The crate + SDK match it 1:1 — the former account-order TODO is resolved.

---

## 9. Room model, fairness & on-chain security

The `eleven` program is the room engine. It handles user funds, so fairness + security are the #1 priority.

**Accounts.**

- **Room** (PDA `["room", authority, room_id]`) — fixed `buy_in`, capped `rake_bps` (≤ 10%), `max_players` (≤ 16), join/end/refund deadlines, `pot`, `treasury`, and an inline list of **Markets** (each a committed `validate_stat` predicate + timing + `yes/no` points + resolution state). Markets are inline for atomicity and a smaller attack surface.
- **Participant** (PDA `["participant", room, owner]`) — `points` (start 0, only from correct predictions), `buy_in_paid` (for exact refunds).
- **Prediction** (PDA `["prediction", room, market_index, owner]`) — a commit-reveal pick: `commitment = sha256(side ++ salt ++ owner ++ market_index)`, then the revealed `side`.

**Instructions.** `create_room` (creator is player #1, same buy-in) · `join_room` · `advance_phase` (crank Lobby→Live→FullTime) · `commit_prediction` / `reveal_prediction` (PRE-MATCH picks) · `commit_live_root` / `reveal_live_pick` (LIVE picks via a per-lock Merkle root) · `resolve_market` (validate_stat CPI → `yes`, or public timeout → `no`) · `settle_room` (pays top scorer(s) pot − rake, ties split, rake → treasury) · `refund` (timelocked, exact buy-in back).

**Two-phase mechanic (the game).** A room is an on-chain state machine — **Lobby → Live → FullTime → Settled**:

- **Lobby** — create/join and place **pre-match** predictions on the match-long menu (total goals O/U, total corners O/U, red card in match, both-teams-to-score, next-goal team). Every pre-match market **locks exactly at kickoff** (enforced on-chain: `pre_match_lock == kickoff_ts`); no commit/reveal after.
- **Live** — the smart generator opens **broader live markets in waves** (goal-in-next-10m, who-scores-next, next-event-is-a-corner, live corners O/U, next-card team), each with its own short lock. Live betting is fast **and** trustless: money moves once at buy-in; individual picks are hashes anchored by a **per-lock Merkle root** committed on-chain at each wave lock (`commit_live_root`) — no transaction per bet — and revealed at settlement (`reveal_live_pick`, membership-proven against the root).
- **FullTime** — the keeper resolves every market via a `validate_stat` Merkle proof; winner by points takes pot − rake; ties split.

**Every market — pre-match or live — settles ONLY on a provable stat (goals/corners/cards).** Context stats (shots, possession, fouls) can *trigger* a live market but never settle one; they display as context.

**Fair odds / anti-drain.** A pick's odds→points value is **snapshotted from the feed at lock and frozen immutably** with the prediction on-chain (`Prediction.award_points` for pre-match; the Merkle leaf for live) — scoring reads the frozen value, never recomputes, so a later or bigger bet changes nothing. A **max-points-per-market cap** (`MAX_POINTS_PER_MARKET = 1000`, on-chain constant) clamps every snapshot, so one longshot can't dominate the pot. Scoring is deterministic: reproducible from frozen snapshots + proof-verified outcomes.

**Fairness (fixes pay-to-win).** Buy-in is uniform per room; the pot is `buy_in × players`. Stake never buys points — points come only from correct, revealed predictions, scaled by each market's odds. Winner is decided purely by points; ties split equally; the floor-division dust is handed to the first winners so the pot is conserved and the rake stays exact.

**Security guarantees → the test that proves each** (`anchor/programs/eleven/tests/test_room.rs`, 14 tests + 11 core):

- Escrow leaves only via `settle_room` (all markets resolved) or `refund` — no admin drain path exists → `cannot_settle_without_resolving_markets`, `refund_*`.
- Rake capped at 10% on-chain, computed in u128 → `rake_is_capped_on_chain`, `large_pot_rake_math_is_safe`.
- Every account is a checked PDA (seeds + bump), signer-checked, `has_one`/constraint-bound; remaining accounts are re-derived, sorted, and de-duplicated → the resolve/settle scoring paths.
- Commit + reveal both enforced before the lock → `cannot_commit_or_reveal_after_lock`, `bad_reveal_is_rejected`.
- Each market resolves once, each room settles once, the TxOracle program id is validated on every CPI → `market_cannot_resolve_twice`, `room_cannot_settle_twice`, `wrong_oracle_is_rejected`.
- Winner takes pot − rake; ties split equally; bigger stake yields no extra points; checked math throughout → `winner_takes_pot_minus_rake`, `ties_split_equally`, `bigger_buy_in_yields_no_extra_points`.

---

## 10. Settlement keeper (Trading Tools & Agents track)

`apps/keeper` is the autonomous agent that makes matches self-run — the Trading
Tools & Agents entry. It subscribes to the TxLINE SSE stream, tracks each open
market's predicate, and the instant a condition is decided fetches the
`stat-validation` Merkle proof and submits `resolve_market` on-chain with **no
human input**; at full time it submits `settle_room` (winner − rake). Reuses the
`txline-settlement` crate shapes + the generated `eleven` IDL.

**Provable-predicate model.** It watches only *monotone* provable predicates
(team-goals-over-N, corners-over-N, red-card-shown), which map 1:1 onto the
program's two paths: cross-true → `ProveYes` with a real `validate_stat` proof;
never-crossed-by-deadline → `TimeoutNo` (public timeout). The predicate is derived
on-chain from the committed market, so the keeper supplies proof material only.

**Idempotent + crash-safe.** State (`resolved`/`settled` sets + `lastSeq`) is
flushed atomically after every committed action; a market is marked resolved only
after its tx confirms. On restart it never double-resolves or double-settles, and
the SSE stream resumes from `Last-Event-ID` with exponential-backoff reconnect.
Config-driven (`keeper.config.*.json`); runs on the sim feed (zero-token demo) and
the live feed with the token.

**Tests** (`node --test`, 4 passing): resolves a market once from a mock proof;
settles a room once; ignores unprovable/edge events; recovers after a stream drop
without double-resolving. See `apps/keeper/README.md` to run it (sim + live).
