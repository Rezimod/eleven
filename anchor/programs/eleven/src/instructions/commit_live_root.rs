use anchor_lang::prelude::*;

use crate::{constants::*, error::ElevenError, state::*};

/// Commit a LIVE wave's per-lock Merkle root — the aggregated commitment of every
/// pick placed during that wave (gathered off-chain). ONE transaction per wave,
/// not per bet: this is how live betting stays fast AND trustless. The root is
/// immutable once set, so no pick can be added or altered after the lock.
#[derive(Accounts)]
pub struct CommitLiveRoot<'info> {
    /// Permissionless — the room/keeper posts the wave root; it commits to picks
    /// players already signed off-chain, so no trust is placed in the caller.
    pub settler: Signer<'info>,

    #[account(
        mut,
        seeds = [ROOM_SEED, room.authority.as_ref(), &room.room_id.to_le_bytes()],
        bump = room.bump,
    )]
    pub room: Account<'info, Room>,
}

pub fn handle_commit_live_root(
    ctx: Context<CommitLiveRoot>,
    market_index: u16,
    root: [u8; 32],
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let room = &mut ctx.accounts.room;
    let market = room
        .markets
        .get_mut(market_index as usize)
        .ok_or(ElevenError::BadMarketIndex)?;

    require!(market.is_live, ElevenError::NotLiveMarket);
    require!(!market.resolved, ElevenError::MarketAlreadyResolved);
    require!(!market.root_committed, ElevenError::RootAlreadyCommitted);
    // The wave's picks close at its lock; the root is finalized here, no later than
    // the resolve deadline, and can never change afterwards.
    require!(now <= market.resolve_deadline_ts, ElevenError::MarketLocked);

    market.commit_root = root;
    market.root_committed = true;
    msg!("commit_live_root: market {} root committed", market_index);
    Ok(())
}
