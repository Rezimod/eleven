use anchor_lang::prelude::*;
use txline_settlement::ProofNode;

use crate::{constants::*, error::ElevenError, merkle, state::*};

/// Reveal a LIVE pick against its wave's committed Merkle root and score it. The
/// leaf freezes the pick's `side` AND its `award_points` (the odds snapshot), so
/// scoring reads a value fixed at lock. The `LivePick` PDA is created here, so a
/// pick can be revealed — and scored — exactly once.
#[derive(Accounts)]
#[instruction(market_index: u16)]
pub struct RevealLivePick<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [ROOM_SEED, room.authority.as_ref(), &room.room_id.to_le_bytes()],
        bump = room.bump,
    )]
    pub room: Account<'info, Room>,

    #[account(
        mut,
        seeds = [PARTICIPANT_SEED, room.key().as_ref(), owner.key().as_ref()],
        bump = participant.bump,
        constraint = participant.owner == owner.key() @ ElevenError::AccountMismatch,
    )]
    pub participant: Account<'info, Participant>,

    #[account(
        init,
        payer = owner,
        space = 8 + LivePick::INIT_SPACE,
        seeds = [LIVE_PICK_SEED, room.key().as_ref(), &market_index.to_le_bytes(), owner.key().as_ref()],
        bump,
    )]
    pub live_pick: Account<'info, LivePick>,

    pub system_program: Program<'info, System>,
}

pub fn handle_reveal_live_pick(
    ctx: Context<RevealLivePick>,
    market_index: u16,
    side: u8,
    award_points: u32,
    salt: [u8; 32],
    proof: Vec<ProofNode>,
) -> Result<()> {
    require!(side <= 1, ElevenError::BadSide);
    // ANTI-DRAIN cap enforced at reveal — a longshot can't dominate the pot.
    require!(award_points <= MAX_POINTS_PER_MARKET, ElevenError::PointsCapExceeded);

    let room = &ctx.accounts.room;
    let market = room
        .markets
        .get(market_index as usize)
        .ok_or(ElevenError::BadMarketIndex)?;
    require!(market.is_live, ElevenError::NotLiveMarket);
    require!(market.root_committed, ElevenError::RootNotCommitted);
    require!(market.resolved, ElevenError::MarketNotResolved);

    // The leaf binds owner + market + side + FROZEN points + salt; it must sit
    // under the wave's committed root, or this pick was never in the wave.
    let leaf = merkle::live_pick_leaf(&ctx.accounts.owner.key(), market_index, side, award_points, &salt);
    require!(
        merkle::verifies(leaf, &proof, &market.commit_root),
        ElevenError::BadMerkleProof,
    );

    let outcome_side: u8 = if market.outcome { 1 } else { 0 };
    if side == outcome_side {
        let part = &mut ctx.accounts.participant;
        part.points = part
            .points
            .checked_add(award_points as u64)
            .ok_or(ElevenError::MathOverflow)?;
    }

    let lp = &mut ctx.accounts.live_pick;
    lp.room = room.key();
    lp.owner = ctx.accounts.owner.key();
    lp.market_index = market_index;
    lp.award_points = award_points;
    lp.bump = ctx.bumps.live_pick;
    Ok(())
}
