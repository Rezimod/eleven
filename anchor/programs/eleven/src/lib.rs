pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

/// Re-export the reusable settlement primitive so consumers (and tests) can use
/// `eleven::settlement::{ValidateStatArgs, FixtureSummary, ProofNode, Predicate}`.
pub use txline_settlement as settlement;
use txline_settlement::{FixtureSummary, Predicate, ProofNode};

declare_id!("2DoTb77aro9SoArLPQMucnCxoTDnvZvZskYtYhSdywRm");

#[program]
pub mod eleven {
    use super::*;

    /// Open a "next goal" micro-prediction pool and escrow the stake.
    pub fn create_pool(ctx: Context<CreatePool>, args: CreatePoolArgs) -> Result<()> {
        instructions::create_pool::handle_create_pool(ctx, args)
    }

    /// Settle a pool. Verifies the predicate against TxLINE's on-chain daily
    /// scores Merkle root via a `validate_stat` CPI, then releases escrow to the
    /// winner. Reverts if the proof does not hold — settlement is trustless.
    ///
    /// Args are the TxLINE proof bundle (fetch from `/api/scores/stat-validation`):
    ///   `target_ts`, `fixture_summary`, `fixture_proof`, `main_tree_proof`, `predicate`.
    pub fn settle_pool(
        ctx: Context<SettlePool>,
        target_ts: i64,
        fixture_summary: FixtureSummary,
        fixture_proof: Vec<ProofNode>,
        main_tree_proof: Vec<ProofNode>,
        predicate: Predicate,
    ) -> Result<()> {
        instructions::settle_pool::handle_settle_pool(
            ctx,
            target_ts,
            fixture_summary,
            fixture_proof,
            main_tree_proof,
            predicate,
        )
    }
}
