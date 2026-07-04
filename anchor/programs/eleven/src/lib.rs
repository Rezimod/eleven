pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("2DoTb77aro9SoArLPQMucnCxoTDnvZvZskYtYhSdywRm");

#[program]
pub mod eleven {
    use super::*;

    /// Settle a live-football micro-prediction pool.
    ///
    /// The real settlement CPIs into TxLINE's `validate_stat` to prove the
    /// pool's predicate against the on-chain daily scores Merkle root, then
    /// releases USDC escrow to the winning side. The CPI is currently a
    /// documented TODO — see `instructions/settle_pool.rs`.
    pub fn settle_pool(ctx: Context<SettlePool>, target_ts: i64) -> Result<()> {
        instructions::settle_pool::handle_settle_pool(ctx, target_ts)
    }
}
