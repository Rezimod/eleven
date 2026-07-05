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

## 3. V1 scope (depth over breadth)

**Principle: nail one loop perfectly.** One event type, one real pool, real proofs, real settlement — polished end to end. We win on the settlement being genuinely trustless and genuinely verifiable, not on surface area.

**IN scope for V1:**

- **Exactly one event type: "next goal".** Who scores the next goal (or the next-goal window). Nothing else.
- **Free-play hero experience.** The default, wallet-free way anyone experiences the loop.
- **Exactly ONE real USDC pool.** A single live market with real money and real escrow.
- **Real `validate_stat` settlement.** Actual CPI into the TxOracle program, real Merkle proof verification against the on-chain daily-scores root before escrow releases.
- **Verifiable-receipt UI.** Anyone can re-derive the payout from the proof and confirm it independently.

**OUT of scope for V1 (explicitly):**

- Other event types (final score, corners, cards, first scorer, over/under, etc.).
- Multiple simultaneous pools or a market browser/list.
- Parimutuel tuning, odds engines, order books, or AMM-style pricing beyond the single pool's mechanics.
- Leaderboards, seasons, social graph, profiles.
- Multi-sport or multi-league. One match at a time.
- Mainnet at scale — V1 targets a clean, demoable single live pool.

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
- **UI-agnostic core engine (`lib/eleven`)** — the prediction/scoring loop, shared by **web-now** and **TMA-later**. No UI assumptions.
- **On-chain program IDs are pinned to the verified TxOracle addresses:** devnet `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`, mainnet `9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA`. The TxOracle IDL is now **vendored** (`anchor/idl/txoracle.json`, from `txodds/tx-on-chain`): `validate_stat` takes exactly one account (`daily_scores_merkle_roots`) and eight positional args. The crate + SDK match it 1:1 and the 6 litesvm settlement tests pass — the former account-order TODO is resolved.
