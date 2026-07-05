use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

use crate::{constants::*, error::ElevenError, state::*};

#[derive(Accounts)]
pub struct JoinRoom<'info> {
    #[account(mut)]
    pub joiner: Signer<'info>,

    #[account(
        mut,
        seeds = [ROOM_SEED, room.authority.as_ref(), &room.room_id.to_le_bytes()],
        bump = room.bump,
    )]
    pub room: Account<'info, Room>,

    #[account(
        init,
        payer = joiner,
        space = 8 + Participant::INIT_SPACE,
        seeds = [PARTICIPANT_SEED, room.key().as_ref(), joiner.key().as_ref()],
        bump,
    )]
    pub participant: Account<'info, Participant>,

    pub system_program: Program<'info, System>,
}

pub fn handle_join_room(ctx: Context<JoinRoom>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let room = &mut ctx.accounts.room;

    require!(room.state == RoomState::Open, ElevenError::BadRoomState);
    require!(!room.settled, ElevenError::RoomAlreadySettled);
    require!(now < room.join_deadline_ts, ElevenError::JoinClosed);
    require!(room.player_count < room.max_players, ElevenError::RoomFull);

    // The `init` on the participant PDA makes double-joining impossible (the
    // account already exists → the instruction fails).
    let participant = &mut ctx.accounts.participant;
    participant.room = room.key();
    participant.owner = ctx.accounts.joiner.key();
    participant.points = 0;
    participant.buy_in_paid = room.buy_in_lamports;
    participant.refunded = false;
    participant.bump = ctx.bumps.participant;

    room.player_count = room
        .player_count
        .checked_add(1)
        .ok_or(ElevenError::MathOverflow)?;
    room.pot_lamports = room
        .pot_lamports
        .checked_add(room.buy_in_lamports)
        .ok_or(ElevenError::MathOverflow)?;

    if room.buy_in_lamports > 0 {
        transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                Transfer {
                    from: ctx.accounts.joiner.to_account_info(),
                    to: ctx.accounts.room.to_account_info(),
                },
            ),
            ctx.accounts.room.buy_in_lamports,
        )?;
    }

    Ok(())
}
