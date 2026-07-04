use anchor_lang::prelude::*;

/// A live-football micro-prediction pool.
///
/// Players stake USDC on whether a single TxLINE stat (`stat_key`, e.g. corners,
/// goals, cards) for a given `fixture_id` will satisfy `comparison(threshold)`
/// by `deadline_ts`. Settlement proves the outcome against TxLINE's on-chain
/// Merkle root via `validate_stat` before releasing escrow.
#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub authority: Pubkey,
    /// TxLINE `fixtureId`.
    pub fixture_id: u32,
    /// TxLINE `ScoreStat.key` — the stat being predicted.
    pub stat_key: u16,
    /// TxLINE `ScoreStat.period` (match period the stat is scoped to).
    pub period: u16,
    /// Predicate threshold the stat is compared against.
    pub threshold: i32,
    /// Predicate comparison: 0 = GreaterThan, 1 = LessThan, 2 = Equal.
    pub comparison: u8,
    /// Cutoff after which the pool may be settled.
    pub deadline_ts: i64,
    /// USDC (base units) held in the pool's escrow vault.
    pub total_escrow: u64,
    /// True once settled; blocks double settlement.
    pub settled: bool,
    /// Result written after the `validate_stat` CPI confirms the predicate.
    pub outcome: bool,
    pub bump: u8,
}
