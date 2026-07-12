use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

use crate::{constants::*, error::ElevenError, state::*};

/// One market's fixed config, supplied at room creation.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct MarketInit {
    pub stat_key: u16,
    pub period: u16,
    pub threshold: i64,
    pub comparison: u8,
    pub has_second: bool,
    pub stat_key2: u16,
    pub period2: u16,
    pub op: u8,
    pub lock_ts: i64,
    pub resolve_deadline_ts: i64,
    pub yes_points: u32,
    pub no_points: u32,
    /// PRE-MATCH (false, locks at kickoff) vs LIVE-WAVE (true, later short lock).
    pub is_live: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CreateRoomArgs {
    pub room_id: u64,
    pub fixture_id: u32,
    pub buy_in_lamports: u64,
    pub rake_bps: u16,
    pub max_players: u16,
    pub join_deadline_ts: i64,
    pub kickoff_ts: i64,
    pub end_ts: i64,
    pub refund_deadline_ts: i64,
    pub treasury: Pubkey,
    pub markets: Vec<MarketInit>,
}

#[derive(Accounts)]
#[instruction(args: CreateRoomArgs)]
pub struct CreateRoom<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        space = 8 + Room::INIT_SPACE,
        seeds = [ROOM_SEED, creator.key().as_ref(), &args.room_id.to_le_bytes()],
        bump,
    )]
    pub room: Account<'info, Room>,

    #[account(
        init,
        payer = creator,
        space = 8 + Participant::INIT_SPACE,
        seeds = [PARTICIPANT_SEED, room.key().as_ref(), creator.key().as_ref()],
        bump,
    )]
    pub participant: Account<'info, Participant>,

    pub system_program: Program<'info, System>,
}

pub fn handle_create_room(ctx: Context<CreateRoom>, args: CreateRoomArgs) -> Result<()> {
    // ── validate config ──────────────────────────────────────────────────
    require!(args.rake_bps <= MAX_RAKE_BPS, ElevenError::RakeTooHigh);
    require!(
        args.max_players >= MIN_PLAYERS && args.max_players <= MAX_PLAYERS,
        ElevenError::BadPlayerCount,
    );
    require!(
        !args.markets.is_empty() && args.markets.len() <= MAX_MARKETS,
        ElevenError::BadMarketCount,
    );
    require!(
        args.join_deadline_ts <= args.kickoff_ts
            && args.kickoff_ts < args.end_ts
            && args.end_ts <= args.refund_deadline_ts,
        ElevenError::BadDeadlines,
    );

    let mut markets: Vec<Market> = Vec::with_capacity(args.markets.len());
    for m in args.markets.iter() {
        require!(m.comparison <= 2, ElevenError::PredicateMismatch);
        require!(!m.has_second || m.op <= 1, ElevenError::PredicateMismatch);
        require!(m.yes_points > 0 && m.no_points > 0, ElevenError::BadPoints);
        // Pre-match markets lock EXACTLY at kickoff; live-wave markets lock later
        // (after kickoff, before full time). Both resolve by full time.
        if m.is_live {
            require!(
                args.kickoff_ts <= m.lock_ts
                    && m.lock_ts <= m.resolve_deadline_ts
                    && m.resolve_deadline_ts <= args.end_ts,
                ElevenError::BadDeadlines,
            );
        } else {
            require!(m.lock_ts == args.kickoff_ts, ElevenError::PreMatchLockNotKickoff);
            require!(
                m.resolve_deadline_ts <= args.end_ts,
                ElevenError::BadDeadlines,
            );
        }
        markets.push(Market {
            stat_key: m.stat_key,
            period: m.period,
            threshold: m.threshold,
            comparison: m.comparison,
            has_second: m.has_second,
            stat_key2: m.stat_key2,
            period2: m.period2,
            op: m.op,
            lock_ts: m.lock_ts,
            resolve_deadline_ts: m.resolve_deadline_ts,
            yes_points: m.yes_points,
            no_points: m.no_points,
            reveal_count: 0,
            resolved: false,
            outcome: false,
            is_live: m.is_live,
            commit_root: [0u8; 32],
            root_committed: false,
        });
    }

    // ── init room (creator is player #1, paying the same buy-in) ──────────
    let room = &mut ctx.accounts.room;
    room.authority = ctx.accounts.creator.key();
    room.treasury = args.treasury;
    room.room_id = args.room_id;
    room.fixture_id = args.fixture_id;
    room.buy_in_lamports = args.buy_in_lamports;
    room.rake_bps = args.rake_bps;
    room.max_players = args.max_players;
    room.player_count = 1;
    room.join_deadline_ts = args.join_deadline_ts;
    room.kickoff_ts = args.kickoff_ts;
    room.end_ts = args.end_ts;
    room.refund_deadline_ts = args.refund_deadline_ts;
    room.pot_lamports = args.buy_in_lamports;
    room.resolved_market_count = 0;
    room.phase = RoomPhase::Lobby;
    room.settled = false;
    room.markets = markets;
    room.bump = ctx.bumps.room;

    let participant = &mut ctx.accounts.participant;
    participant.room = room.key();
    participant.owner = ctx.accounts.creator.key();
    participant.points = 0;
    participant.buy_in_paid = args.buy_in_lamports;
    participant.refunded = false;
    participant.bump = ctx.bumps.participant;

    // Escrow the buy-in into the room account (on top of its rent).
    if args.buy_in_lamports > 0 {
        transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                Transfer {
                    from: ctx.accounts.creator.to_account_info(),
                    to: ctx.accounts.room.to_account_info(),
                },
            ),
            args.buy_in_lamports,
        )?;
    }

    msg!(
        "create_room: id {} fixture {} buy_in {} rake_bps {} markets {}",
        args.room_id,
        args.fixture_id,
        args.buy_in_lamports,
        args.rake_bps,
        ctx.accounts.room.markets.len(),
    );
    Ok(())
}
