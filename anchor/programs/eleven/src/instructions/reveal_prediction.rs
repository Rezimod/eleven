use anchor_lang::prelude::*;
use solana_sha256_hasher::hashv;

use crate::{constants::*, error::ElevenError, state::*};

/// Recompute the commitment: sha256(side ++ salt ++ owner ++ market_index).
/// Binding to owner + market_index stops a commitment being replayed elsewhere.
pub fn commitment_hash(side: u8, salt: &[u8; 32], owner: &Pubkey, market_index: u16) -> [u8; 32] {
    hashv(&[&[side][..], &salt[..], owner.as_ref(), &market_index.to_le_bytes()[..]]).to_bytes()
}

#[derive(Accounts)]
#[instruction(market_index: u16)]
pub struct RevealPrediction<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [ROOM_SEED, room.authority.as_ref(), &room.room_id.to_le_bytes()],
        bump = room.bump,
    )]
    pub room: Account<'info, Room>,

    #[account(
        mut,
        seeds = [PREDICTION_SEED, room.key().as_ref(), &market_index.to_le_bytes(), owner.key().as_ref()],
        bump = prediction.bump,
        constraint = prediction.owner == owner.key() @ ElevenError::AccountMismatch,
        constraint = prediction.room == room.key() @ ElevenError::AccountMismatch,
    )]
    pub prediction: Account<'info, Prediction>,
}

pub fn handle_reveal_prediction(
    ctx: Context<RevealPrediction>,
    market_index: u16,
    side: u8,
    salt: [u8; 32],
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(side <= 1, ElevenError::BadSide);

    let room = &mut ctx.accounts.room;
    let market = room
        .markets
        .get_mut(market_index as usize)
        .ok_or(ElevenError::BadMarketIndex)?;
    require!(!market.resolved, ElevenError::MarketAlreadyResolved);
    // Same lock as commit: no revealing after the event window opens.
    require!(now < market.lock_ts, ElevenError::MarketLocked);

    let p = &mut ctx.accounts.prediction;
    require!(!p.revealed, ElevenError::AlreadyRevealed);
    let expected = commitment_hash(side, &salt, &p.owner, market_index);
    require!(expected == p.commitment, ElevenError::BadReveal);

    p.side = side;
    p.revealed = true;
    market.reveal_count = market
        .reveal_count
        .checked_add(1)
        .ok_or(ElevenError::MathOverflow)?;
    Ok(())
}
