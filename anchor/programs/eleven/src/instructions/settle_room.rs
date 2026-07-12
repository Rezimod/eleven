use anchor_lang::prelude::*;

use crate::{constants::*, error::ElevenError, state::*};

#[derive(Accounts)]
pub struct SettleRoom<'info> {
    /// Anyone may settle once the room is ready — payouts are determined purely
    /// by proven points, so the caller is not trusted.
    pub settler: Signer<'info>,

    #[account(
        mut,
        seeds = [ROOM_SEED, room.authority.as_ref(), &room.room_id.to_le_bytes()],
        bump = room.bump,
    )]
    pub room: Account<'info, Room>,

    /// CHECK: rake destination, pinned to the room's committed treasury.
    #[account(mut, address = room.treasury @ ElevenError::TreasuryMismatch)]
    pub treasury: UncheckedAccount<'info>,
    // remaining_accounts: [participant_0, wallet_0, participant_1, wallet_1, …]
    // — exactly `room.player_count` pairs, sorted by owner, unique, ALL players.
}

pub fn handle_settle_room<'info>(ctx: Context<'info, SettleRoom<'info>>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    let (room_key, pot, rake_bps, player_count, market_count, resolved_count, phase, settled) = {
        let r = &ctx.accounts.room;
        (
            r.key(),
            r.pot_lamports,
            r.rake_bps,
            r.player_count,
            r.markets.len() as u16,
            r.resolved_market_count,
            r.phase,
            r.settled,
        )
    };

    require!(!settled, ElevenError::RoomAlreadySettled);
    require!(
        phase != RoomPhase::Settled && phase != RoomPhase::Refunding,
        ElevenError::WrongPhase,
    );
    // Full time gates settlement — the room is in FullTime by the clock here.
    require!(now >= ctx.accounts.room.end_ts, ElevenError::EndNotReached);
    // No settlement until every market has been resolved (each yes needs a proof).
    require!(resolved_count == market_count, ElevenError::MarketsUnresolved);

    // ── validate the full participant set + find the winning score ───────
    let rem = ctx.remaining_accounts;
    require!(
        rem.len() == (player_count as usize) * 2,
        ElevenError::AccountCountMismatch,
    );

    struct Row {
        points: i64,
        wallet_idx: usize,
    }
    let mut rows: Vec<Row> = Vec::with_capacity(player_count as usize);
    // Points are signed (wrong-pick penalties) — the winner is max, even if
    // every total is negative, so start below any representable score.
    let mut max_points: i64 = i64::MIN;
    let mut prev: Option<Pubkey> = None;

    for (i, pair) in rem.chunks(2).enumerate() {
        let part = Account::<Participant>::try_from(&pair[0])
            .map_err(|_| error!(ElevenError::BadAccountOwner))?;
        let wallet = &pair[1];

        require_keys_eq!(part.room, room_key, ElevenError::AccountMismatch);
        let (part_pda, _) = Pubkey::find_program_address(
            &[PARTICIPANT_SEED, room_key.as_ref(), part.owner.as_ref()],
            ctx.program_id,
        );
        require_keys_eq!(part_pda, pair[0].key(), ElevenError::AccountMismatch);
        require_keys_eq!(*wallet.key, part.owner, ElevenError::WalletMismatch);
        if let Some(p) = prev {
            require!(part.owner > p, ElevenError::UnsortedOrDuplicate);
        }
        prev = Some(part.owner);

        if part.points > max_points {
            max_points = part.points;
        }
        rows.push(Row { points: part.points, wallet_idx: i * 2 + 1 });
    }

    let winner_count = rows.iter().filter(|r| r.points == max_points).count() as u64;

    // ── compute the split (checked, rake capped) ─────────────────────────
    require!(rake_bps <= MAX_RAKE_BPS, ElevenError::RakeTooHigh);
    let rake = (pot as u128)
        .checked_mul(rake_bps as u128)
        .ok_or(ElevenError::MathOverflow)?
        / 10_000u128;
    let rake = rake as u64;
    let distributable = pot.checked_sub(rake).ok_or(ElevenError::MathOverflow)?;
    let per = distributable / winner_count;
    let dust = distributable - per * winner_count; // < winner_count

    // ── pay out (escrow only leaves here or via refund) ──────────────────
    if pot > 0 {
        let room_ai = ctx.accounts.room.to_account_info();
        let mut paid: u64 = 0;
        let mut rank: u64 = 0;
        for row in rows.iter() {
            if row.points != max_points {
                continue;
            }
            let mut amount = per;
            if rank < dust {
                amount = amount.checked_add(1).ok_or(ElevenError::MathOverflow)?;
            }
            rank += 1;
            if amount > 0 {
                **room_ai.try_borrow_mut_lamports()? -= amount;
                **rem[row.wallet_idx].try_borrow_mut_lamports()? += amount;
                paid = paid.checked_add(amount).ok_or(ElevenError::MathOverflow)?;
            }
        }
        if rake > 0 {
            **room_ai.try_borrow_mut_lamports()? -= rake;
            **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? += rake;
            paid = paid.checked_add(rake).ok_or(ElevenError::MathOverflow)?;
        }
        // Conservation: the whole pot is distributed, nothing stuck, nothing over.
        require!(paid == pot, ElevenError::MathOverflow);
    }

    let room = &mut ctx.accounts.room;
    room.settled = true;
    room.phase = RoomPhase::Settled;
    room.pot_lamports = 0;

    msg!(
        "settle_room: pot {} rake {} winners {} top {}",
        pot,
        rake,
        winner_count,
        max_points,
    );
    Ok(())
}
