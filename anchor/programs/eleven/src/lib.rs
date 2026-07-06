pub mod constants;
pub mod error;
pub mod instructions;
pub mod merkle;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

/// Re-export the reusable settlement primitive so consumers (and tests) can use
/// `eleven::settlement::{ValidateStatArgs, FixtureSummary, ProofNode, Predicate, …}`.
pub use txline_settlement as settlement;

declare_id!("2DoTb77aro9SoArLPQMucnCxoTDnvZvZskYtYhSdywRm");

/// ELEVEN — room-based, multi-event, provable prediction game.
///
/// Fairness: fixed buy-in per room (poker-tournament style); points come only
/// from correct, revealed predictions (stake never buys points); winner(s) take
/// the pot minus a capped rake; ties split equally. Every market outcome is
/// gated on a TxLINE `validate_stat` Merkle proof (or a public timeout).
#[program]
pub mod eleven {
    use super::*;

    /// Create a room with a fixed buy-in + capped rake and its provable markets.
    /// The creator is player #1 and pays the same buy-in.
    pub fn create_room(ctx: Context<CreateRoom>, args: CreateRoomArgs) -> Result<()> {
        instructions::create_room::handle_create_room(ctx, args)
    }

    /// Join an open room, paying the same fixed buy-in into escrow.
    pub fn join_room(ctx: Context<JoinRoom>) -> Result<()> {
        instructions::join_room::handle_join_room(ctx)
    }

    /// Sync the room phase to the clock (Lobby → Live → FullTime). Permissionless.
    pub fn advance_phase(ctx: Context<AdvancePhase>) -> Result<()> {
        instructions::advance_phase::handle_advance_phase(ctx)
    }

    /// Commit a hashed prediction on a market — must land before the lock.
    pub fn commit_prediction(
        ctx: Context<CommitPrediction>,
        market_index: u16,
        commitment: [u8; 32],
    ) -> Result<()> {
        instructions::commit_prediction::handle_commit_prediction(ctx, market_index, commitment)
    }

    /// Reveal a committed prediction — also before the lock, and must match the hash.
    pub fn reveal_prediction(
        ctx: Context<RevealPrediction>,
        market_index: u16,
        side: u8,
        salt: [u8; 32],
    ) -> Result<()> {
        instructions::reveal_prediction::handle_reveal_prediction(ctx, market_index, side, salt)
    }

    /// Commit a LIVE wave's per-lock Merkle root of pick commitments (one tx per
    /// wave, not per bet). Individual picks reveal against it at settlement.
    pub fn commit_live_root(
        ctx: Context<CommitLiveRoot>,
        market_index: u16,
        root: [u8; 32],
    ) -> Result<()> {
        instructions::commit_live_root::handle_commit_live_root(ctx, market_index, root)
    }

    /// Resolve a market once: prove `yes` via a `validate_stat` Merkle proof, or
    /// resolve `no` by public timeout. Scores every revealed prediction.
    pub fn resolve_market<'info>(
        ctx: Context<'info, ResolveMarket<'info>>,
        args: ResolveMarketArgs,
    ) -> Result<()> {
        instructions::resolve_market::handle_resolve_market(ctx, args)
    }

    /// Reveal a LIVE pick against its wave's committed Merkle root and score it
    /// (frozen, capped points). Its `LivePick` guard makes it once-only.
    pub fn reveal_live_pick(
        ctx: Context<RevealLivePick>,
        market_index: u16,
        side: u8,
        award_points: u32,
        salt: [u8; 32],
        proof: Vec<txline_settlement::ProofNode>,
    ) -> Result<()> {
        instructions::reveal_live_pick::handle_reveal_live_pick(
            ctx, market_index, side, award_points, salt, proof,
        )
    }

    /// Settle a room once all markets are resolved: pay the top-scoring player(s)
    /// the pot minus rake (ties split equally); rake goes to the treasury.
    pub fn settle_room<'info>(ctx: Context<'info, SettleRoom<'info>>) -> Result<()> {
        instructions::settle_room::handle_settle_room(ctx)
    }

    /// Refund a player's exact buy-in if the room is unfilled or voided (timelocked).
    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        instructions::refund::handle_refund(ctx)
    }
}
