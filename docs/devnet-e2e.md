# ELEVEN — devnet end-to-end proof (2026-07-06)

First real-chain run: programs deployed, a full room seeded with two keypairs,
the keeper resolved every market and settled, and the pot moved on-chain.
All links are Solana **devnet** (`?cluster=devnet`).

## Program IDs

| program | address | explorer |
|---|---|---|
| eleven | `2DoTb77aro9SoArLPQMucnCxoTDnvZvZskYtYhSdywRm` | https://solscan.io/account/2DoTb77aro9SoArLPQMucnCxoTDnvZvZskYtYhSdywRm?cluster=devnet |
| mock-txoracle | `EMYNsu8SXbH7T524CntUo1vS7BgPRR84WoVDUQ2rXJAr` | https://solscan.io/account/EMYNsu8SXbH7T524CntUo1vS7BgPRR84WoVDUQ2rXJAr?cluster=devnet |

Deploy txs — eleven: `XNWBKcGGFiYv4Ew5gWm5iz4AaAPvTZHDffjmKSFzbrrkhVwRVbBXABhj72iqQJ89ThSNiwqsyNoJ4RGBvYziYqo` ·
mock: `42t7YRQAJ6jtdU5kjaj8kXVLqcfjGsS5Wt4tNLZk1oovAtjqT2X9RSCD44eB8mP58e26RXa7UDxfd1t58siL48pY`

## Room

`CttCiSnh8RzB6Dovq4DNqS8BkKQ1aPGEKHMEe7oztV9W` · buy-in 0.02 SOL · rake 5% · 2 players · 3 markets
(corners>4, red-card, away-goals>5) → https://solscan.io/account/CttCiSnh8RzB6Dovq4DNqS8BkKQ1aPGEKHMEe7oztV9W?cluster=devnet

## Transactions (all `https://solscan.io/tx/<sig>?cluster=devnet`)

Seed:
- create_room `49BWZ5B8wRAcFCNSVakJNArQSW2gVgKDWDtRjfxUXApft14qyRJ6dSohUdwR5LrwTo3DDpZCKRDV7zZ5K9q6FY1n`
- join_room (B) `3Z9oHuqqLo7FEDryfCo9j3PvAd6qxDokS2xAteqYN1waqeCvebPw1JYQntiYTBrNoujyBb9N49xKyX5WYGdhqcnp`
- commit/reveal A m0 `22ZpLNKRfoZen7p1gmYa6HGryAoQ9p1tDLLPLqK2uk2exRTH3jGpZFb2GNfCNPY9hDg6vv3Nj3N3LKuKszmcpt81` / `5yEuqtQHEX5wbjPP8MSQBc85FyMyh1D25v8CFcqG7p8ZZkmsuP36KTWQCF6dTp9fUW8NnJU3GYdgCsU5uP3awGjh`
- commit/reveal A m1 `w5anFksF3zkqKYQd89pmTp1zbauTLKzJc2WUAQnRTZL6kdEnwtTRxuNvT8nRs6ZmM4bQU87FmS2aKbtYvXWsaB6` / `3pJhHWDzpvkhX333AsxEkFknHYUBB8Fj36Lv5iXCqTL9cwsNdDP6HyxAdqvkSRqBC2rC67x4oa8DvFnU3LeJmDxB`
- commit/reveal A m2 `2X1dex133cxad1CCSKtGwmGqamjKF8p1LDXZEEbDPupPuL3Q6MiCZLZ3AkbKJZzvm4ZFb4iBks3JcvuKX417qJv2` / `63YwCVzgLtwApnnaiH9tekbFj6GptiadcMZhGVR8AL6yjNfYnjnGAgKwq4NQPW89dK3B6L1iz4z8PvpYzmrCKfmN`
- commit/reveal B m0 `4XS7qAo3PXpxdJgeDjGPJN3pJ87ZSi6SBnZZHKBtzCrVzVLFiQjeSVDrz3cGAsaWfR9nKG1fNoAAifjyFBwvfvJw` / `2waRU3EiGZXnXoEXMhcd7ToEAqXvfMDtvrfYhSTc8QvAuCCwbh6i389p58tZQVXHZzU5TpTDwW8RStr9V1xpZqgi`
- commit/reveal B m1 `65LXD6UCuUJhJLA2y2m2Sdyze6zcgXFvxUtXoAoSrh6Vgc8gwgu3gPEDdKcmvyU7CeavuVQMy1zFumA1dtReQXhT` / `4hZx3pP9hCBfFQkvfPD38fPZu4bmxvs47LP11ouE4or3CniYXwFhrQukFmsDaE61KRLhdJL7iCa3mo9evduHniw8`
- commit/reveal B m2 `3YPgmJuK3xuZHdCdmco6urn3vh38J4492sMVcWSPaH9z7qDUxQ6YdUzj9r6dFJFzTijiRgDMJiyDStUzJeaC28u6` / `64oN1xkhHJwnVbKBEvpL76MAZon5rUazaJ5hsss1nga4GhDaWeFczXmpGJG1raz63iHALJHoZHeppHYDmb2zA6UT`

Keeper (resolve_market ×3 + settle_room):
- resolve m0 `5HNnLHcmfAYoW94zUxmjy1jRxKNFqM658Qx3EQoF3jTGymeuToTrcPScxzbUHrHJDcerB4rV59THRF4FWe23WLs5`
- resolve m1 `43T5LS8rQcXJ1TACFmBiQ8WcA3TDENmWZJv7K1nHdSUytxuvN2ZoM5wSLCqL1GjaR4HGwfDv2e8fNx6mYg5pQ2H4`
- resolve m2 `5A9ZeD4tSGn3xHaoK1XeR9oLsia1VVwSaknHAE1EGvQFyXZTuxnmh7dVC42uPBQqUFGtSA9BVodjLZCNykGjcbTV`
- **settle_room** `36HJRtQYTEiZd5zU2NuqMuX8GrssJH5mthkkLrQzkQEWtriP6iarGkEtASR9RVNbowZt5dbDy8Keiks26gE42tPd`

## Result (verified on-chain)

- room `settled: true`, `pot_lamports: 0`, `resolved_market_count: 3/3`, outcomes NO/NO/NO
- points: A = 100, **B = 160 → winner**
- **winner B: 0.0515 SOL** (received pot − rake = 0.038)
- **treasury: 0.0035 SOL** = 0.0015 prefund + **0.002 rake** (exact)
- conservation: 0.038 (winner) + 0.002 (rake) = 0.04 (pot) ✓

## Note on validate_stat (ProveYes)

The keeper's first pass attempted `resolve_market{ProveYes}` (the `validate_stat`
CPI) but the mock reverted with `DeclaredProgramIdMismatch`: the mock's
`declare_id` is the real oracle address `6pW64…` (so it can stand in during
litesvm, where it is loaded at that address), which ≠ its devnet deploy address
`EMYNsu8…`. Fix = set the mock's `declare_id` to `EMYNsu8…`, rebuild, and
`solana program deploy` (in-place upgrade). That upgrade needs ~0.6 SOL for the
buffer and the devnet faucet was hard rate-limited (12 airdrops failed), so the
three markets were resolved via the `TimeoutNo` path instead — which still
exercises `resolve_market` on-chain and drives the full settle + pot flow above.
The `validate_stat` CPI itself is proven by the 14 litesvm tests
(`anchor/programs/eleven/tests/test_room.rs`). Pass 2 (real TxOracle `6pW64…` +
a real `/api/scores/stat-validation` proof) additionally requires eleven re-pinned
to `6pW64…` and a settled World Cup stat.
