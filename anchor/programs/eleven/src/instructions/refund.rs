use anchor_lang::prelude::*;

use crate::{constants::*, error::ElevenError, state::*};

#[derive(Accounts)]
pub struct Refund<'info> {
    /// Permissionless: anyone (e.g. a keeper) can trigger a player's refund —
    /// the funds only ever go back to that player's own wallet.
    pub settler: Signer<'info>,

    #[account(
        mut,
        seeds = [ROOM_SEED, room.authority.as_ref(), &room.room_id.to_le_bytes()],
        bump = room.bump,
    )]
    pub room: Account<'info, Room>,

    #[account(
        mut,
        close = owner_wallet,
        seeds = [PARTICIPANT_SEED, room.key().as_ref(), participant.owner.as_ref()],
        bump = participant.bump,
        constraint = participant.room == room.key() @ ElevenError::AccountMismatch,
        constraint = !participant.refunded @ ElevenError::AlreadyRefunded,
    )]
    pub participant: Account<'info, Participant>,

    /// CHECK: receives the exact buy-in + rent; pinned to the participant owner.
    #[account(mut, address = participant.owner @ ElevenError::WalletMismatch)]
    pub owner_wallet: UncheckedAccount<'info>,
}

pub fn handle_refund(ctx: Context<Refund>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let room = &ctx.accounts.room;

    require!(!room.settled, ElevenError::RoomAlreadySettled);
    require!(room.phase != RoomPhase::Settled, ElevenError::WrongPhase);
    // Refunds only open once the room is provably not going to run as intended:
    //   - unfilled (never reached MIN_PLAYERS) after the join window, OR
    //   - voided: not settled by the refund timelock.
    let unfilled = room.player_count < MIN_PLAYERS && now >= room.join_deadline_ts;
    let voided = now >= room.refund_deadline_ts;
    require!(unfilled || voided, ElevenError::RefundNotAvailable);

    let amount = ctx.accounts.participant.buy_in_paid;

    // Return the EXACT buy-in from escrow (rent is returned by `close`).
    if amount > 0 {
        let room_ai = ctx.accounts.room.to_account_info();
        **room_ai.try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.owner_wallet.to_account_info().try_borrow_mut_lamports()? += amount;
    }

    let room = &mut ctx.accounts.room;
    room.phase = RoomPhase::Refunding;
    room.pot_lamports = room
        .pot_lamports
        .checked_sub(amount)
        .ok_or(ElevenError::MathOverflow)?;

    // Mark refunded before `close` runs (defensive; the account is closed anyway).
    ctx.accounts.participant.refunded = true;

    msg!("refund: {} lamports returned to {}", amount, ctx.accounts.owner_wallet.key());
    Ok(())
}
