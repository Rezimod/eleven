# ELEVEN — devnet end-to-end proof (2026-07-06)

Full real-chain loop, settled by the **real `validate_stat` ProveYes CPI** — not the
timeout fallback. Programs deployed, a room seeded with two keypairs, the keeper
resolved all three markets through the on-chain Merkle-proof CPI, then settled; the
pot moved and conservation holds. All links are Solana **devnet** (`?cluster=devnet`).

## Program IDs

| program | address | explorer |
|---|---|---|
| eleven | `2DoTb77aro9SoArLPQMucnCxoTDnvZvZskYtYhSdywRm` | https://solscan.io/account/2DoTb77aro9SoArLPQMucnCxoTDnvZvZskYtYhSdywRm?cluster=devnet |
| mock-txoracle | `EMYNsu8SXbH7T524CntUo1vS7BgPRR84WoVDUQ2rXJAr` | https://solscan.io/account/EMYNsu8SXbH7T524CntUo1vS7BgPRR84WoVDUQ2rXJAr?cluster=devnet |

The deployed `eleven` pins its settlement CPI to `EMYNsu8…` (its committed
`TXLINE_ORACLE_PROGRAM_ID`) — verified by simulating `resolve_market{ProveYes}`:
`oracle=EMYNsu8…` passes the address constraint, `oracle=6pW64…` fails
`InvalidOracleProgram`. So only the **mock** needed a redeploy this run.

Mock upgrade (declare_id fix) — the mock's `declare_id` must equal its devnet deploy
address `EMYNsu8…` (its litesvm/source id is the real oracle `6pW64…`, so the source
is built with the devnet id only for this deploy and reverted afterwards, keeping the
14 litesvm tests green):
`CUcDAkgjTPpWqGziKZjWzXNz29Sx3wDPNkLxMYqmU8w2HTVMgcSpWqKPqjDYfUYhKaRgwYNdFZpy5Qrs7cnTMuo`

## Room

`9qQmz6mFSd2E99XX62E5QxpicLEHRio8qcYh5SHew5oA` · buy-in 0.02 SOL · rake 5% · 2 players · 3 markets
(corners>4, red-card, home-goals>2) → https://solscan.io/account/9qQmz6mFSd2E99XX62E5QxpicLEHRio8qcYh5SHew5oA?cluster=devnet

Players: A `EuYsc8crM4EFRuD2AysNj1RFgYFbzRyWL2XpYEMBF3UB` (picks YES,YES,YES) ·
B `YXMw2uRp2KSuB8jwL4Wr7JwyonKrY7NqCDRqy88Rtjg` (picks NO,NO,NO) ·
treasury `5ufkUNHzdRhGkW2gbiEgrpJfmzvwWoF1aPo4hbZ63mmd`.

## Transactions (all `https://solscan.io/tx/<sig>?cluster=devnet`)

Seed:
- create_room `4JmLyjKpGZbUGBwnSYKNBsDViB5XuUmaWYDYb5r4w3nTqCGWUmJACjqLuaz7A5W5nv6eGA5S25ZNcXJGFx2Ut71j`
- join_room (B) `4VVbKZ1yGULmH31Yp2v5V9SubxX7byb9LiPK6KZSZQRtdmkjPzF6kc4dr2DL8Xu3qAEG64BX9SyBgJNAoUfGmqNu`
- commit/reveal A m0 `9Bjfgz1Cwv498hLejVhmsExTjwfQoLaPnSU1atLSEwFEnySUn39Cph45tTeXZRCbzqBfW5VuCm4havxXT93n96V` / `3cYuisYocfRM6M5QeXuHvMtxkD8Uu6yGNfDPh1ZFU4PrhW5XjA5KCA45DKpJjCiyHKkzMG1eKP4C28CB8c5zC6rw`
- commit/reveal A m1 `4GkKFuthecJur1HxAZortdW9DsE4J33sNJoxQEJ4kDAjZmM4vfzk9h6GjwhWESaXZaTQfirYPEvzTKSg2842W9Ey` / `5hP6kourdC2TGbqZTkDJvMgf4TCbXeyAhcCTmMc4W2sNR5gHZHvSGfQnNkhS7WspKUSGGZ2DehEgz2s52VJjWj96`
- commit/reveal A m2 `2xtYV8qxTPJ4pfpALkTcqFFRfZey6oNvkLoeHEDiwaevHmsvaKDsyLZv2zsMT5GiZQE93NrujyyBPfg2hcMP9be6` / `5JqRdDvJFuANCHgvXtq9QFxXg7Nz978q67z3E7jvn7DgDYcw118Q9syWLq9UWqi7twxL4Zc14A8moHPW96g6ZoCe`
- commit/reveal B m0 `AyFi8zYyyk1mahmMVKY9WrW5QLyxfTQG4Kb9r77QhZi5No1NZo8Wc9auGdiVUQFLh43KmKwwrZhn94nAJhvVG3G` / `3KgfHS2zAFpbtMzSsE9xCD748gkxZXhpHSFsNGw6aeSxyPmXwtGaAJwP7VcGTUqkrR6DTGamrcdXUnQrY2qqvKeV`
- commit/reveal B m1 `3M3dXGSL77s7oKcXTwkXMP25fXx2gMSYhszPCPcfmJaikWiVeSCsMpqD7nUtdiAPNeLSGgXJvjNpwXLwuvgWpt1G` / `4k21LJUNuH2LY8sR23j3zRXkpTY86k2MUphfkLzvJpqFfzE23dLT98j4esVtNjFDTmKRx5DiruEQHq6MVzduyTH8`
- commit/reveal B m2 `3MhtnZxCnadQptni3Sxy363F4NmSiZcNHVjhFq9W9cfnpifdYS2E7voRA2cu3GqhxgDQCHDt7VzBtjJWAXFW3rhy` / `56kN1Y3NBmxR3dFjxhFLWGBRHr9G6dNKGPQVCBfdJGMeXSBsGeNxNMp6NhvmvDXfKtagkqRht3BSrxLggAbtFuQX`

Keeper — **all three via `resolve_market{ProveYes}` (validate_stat Merkle-proof CPI)** + `settle_room`:
- resolve m0 corners>4 (ProveYes) `2qwsfrBMhRkxg37v1w1h97iiVcUoxLabkY4p6KmKta4VpSwCPp9PKnAJzgF2kjDm5fCU6pyk3kfDShFtZUV4CzSt`
- resolve m1 red-card (ProveYes) `61PPhMTxs5pwLSxX4NRnqtBdmUtU1MWxSnKhcNyEGMHCYrM1MePRPkW8WEY2z4x9zCNk28LRhCVWogELnMtpgzok`
- resolve m2 home-goals>2 (ProveYes) `4NsQb6SGnUNGfe3nGA2JYELQFFrrVh8pqKG6i6zKm5YDPgfDFmLixk3KzT4XwyZBAeh9weGLq9ZPaj72D9Sj6bKe`
- **settle_room** `e6vPzcAQbMXBxAumSvrQMUeASSM8EwFkYpWhhYmsXqQnZnXnpbwjM63AfAJ3b55cgXcBKrdWQYqdBr4pdetZhjS`

## Result (verified on-chain)

- room `settled: true`, `pot_lamports: 0`, `resolved_market_count: 3/3`, outcomes **YES/YES/YES**
- points: **A = 400 → winner**, B = 0
- **winner A: 0.057038 SOL** (received pot − rake = 0.038)
- **treasury: 0.0035 SOL** = 0.0015 prefund + **0.002 rake** (exact)
- conservation: 0.038 (winner) + 0.002 (rake) = 0.04 (pot) ✓ · pot zeroed

## Proof that ProveYes (not timeout) settled it

Every `resolve_market` used `kind: ProveYes` and CPI'd into the mock TxOracle. The
on-chain logs of resolve m0 (`2qwsfrB…`):

```
Program 2DoTb77aro9SoArLPQMucnCxoTDnvZvZskYtYhSdywRm invoke [1]
Program log: Instruction: ResolveMarket
Program EMYNsu8SXbH7T524CntUo1vS7BgPRR84WoVDUQ2rXJAr invoke [2]
Program log: Instruction: ValidateStat
Program EMYNsu8SXbH7T524CntUo1vS7BgPRR84WoVDUQ2rXJAr success
Program log: resolve_market: idx 0 outcome true
Program 2DoTb77aro9SoArLPQMucnCxoTDnvZvZskYtYhSdywRm success
```

`ResolveMarket → ValidateStat (CPI) → success → outcome true` is the trustless
settlement path: the Merkle-proof CPI released escrow, no timeout, no operator. (The
devnet mock stands in for TxOracle's Merkle verifier — it accepts iff proof material
is supplied; the byte-for-byte real-verifier path against a live World Cup stat +
TxOracle `6pW64…` is unchanged and covered by the 14 litesvm tests.)
