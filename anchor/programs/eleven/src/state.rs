use anchor_lang::prelude::*;

/// A live-football "next goal" micro-prediction pool.
///
/// V1 escrow is held as native lamports inside this account (the amount above
/// rent). Production swaps this for a USDC SPL vault — the settlement gating in
/// `settle_pool` is identical; only the transfer changes. See `docs/PLAYBOOK.md`.
#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub authority: Pubkey,
    /// Paid the escrow iff the predicate is proven true at settlement.
    pub winner: Pubkey,
    /// TxLINE `fixtureId`.
    pub fixture_id: u32,
    /// TxLINE `ScoreStat.key` — the stat being predicted (e.g. goals).
    pub stat_key: u16,
    /// TxLINE `ScoreStat.period`.
    pub period: u16,
    /// Predicate threshold committed at pool creation.
    pub threshold: i64,
    /// Predicate comparison: 0 = GreaterThan, 1 = LessThan, 2 = Equal.
    pub comparison: u8,
    /// Cutoff after which the pool may be settled.
    pub deadline_ts: i64,
    /// Escrowed stake (lamports) released to `winner` on a proven outcome.
    pub stake_lamports: u64,
    /// True once settled; blocks double settlement.
    pub settled: bool,
    /// Result written after the `validate_stat` CPI confirms the predicate.
    pub outcome: bool,
    pub bump: u8,
}
