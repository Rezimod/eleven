use anchor_lang::prelude::*;

use crate::{constants::*, error::ElevenError, state::*};

/// Sync the room's phase to the clock: Lobby → Live (at kickoff) → FullTime (at
/// end). Permissionless — the keeper ticks it at kickoff and full time, but the
/// phase it lands on is fixed by the clock, not the caller. Terminal phases
/// (Settled / Refunding) never move.
#[derive(Accounts)]
pub struct AdvancePhase<'info> {
    pub cranker: Signer<'info>,

    #[account(
        mut,
        seeds = [ROOM_SEED, room.authority.as_ref(), &room.room_id.to_le_bytes()],
        bump = room.bump,
    )]
    pub room: Account<'info, Room>,
}

pub fn handle_advance_phase(ctx: Context<AdvancePhase>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let room = &mut ctx.accounts.room;
    require!(
        room.phase != RoomPhase::Settled && room.phase != RoomPhase::Refunding,
        ElevenError::WrongPhase,
    );
    room.phase = room.phase.from_clock(now, room.kickoff_ts, room.end_ts);
    msg!("advance_phase: now {} phase {:?}", now, room.phase);
    Ok(())
}
