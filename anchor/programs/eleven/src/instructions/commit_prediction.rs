use anchor_lang::prelude::*;

use crate::{constants::*, error::ElevenError, state::*};

#[derive(Accounts)]
#[instruction(market_index: u16)]
pub struct CommitPrediction<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [ROOM_SEED, room.authority.as_ref(), &room.room_id.to_le_bytes()],
        bump = room.bump,
    )]
    pub room: Account<'info, Room>,

    #[account(
        seeds = [PARTICIPANT_SEED, room.key().as_ref(), owner.key().as_ref()],
        bump = participant.bump,
        constraint = participant.owner == owner.key() @ ElevenError::AccountMismatch,
    )]
    pub participant: Account<'info, Participant>,

    #[account(
        init,
        payer = owner,
        space = 8 + Prediction::INIT_SPACE,
        seeds = [PREDICTION_SEED, room.key().as_ref(), &market_index.to_le_bytes(), owner.key().as_ref()],
        bump,
    )]
    pub prediction: Account<'info, Prediction>,

    pub system_program: Program<'info, System>,
}

pub fn handle_commit_prediction(
    ctx: Context<CommitPrediction>,
    market_index: u16,
    commitment: [u8; 32],
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let room = &ctx.accounts.room;

    let market = room
        .markets
        .get(market_index as usize)
        .ok_or(ElevenError::BadMarketIndex)?;
    // Per-player commit/reveal is the PRE-MATCH path; live waves use a Merkle root.
    require!(!market.is_live, ElevenError::NotPreMatchMarket);
    require!(!market.resolved, ElevenError::MarketAlreadyResolved);
    // The on-chain lock: pre-match markets lock at kickoff — no commit after it.
    require!(now < market.lock_ts, ElevenError::MarketLocked);

    let p = &mut ctx.accounts.prediction;
    p.room = room.key();
    p.owner = ctx.accounts.owner.key();
    p.market_index = market_index;
    p.commitment = commitment;
    p.revealed = false;
    p.side = 0;
    p.scored = false;
    p.award_points = 0;
    p.bump = ctx.bumps.prediction;
    Ok(())
}
