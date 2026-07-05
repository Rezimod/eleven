use anchor_lang::prelude::*;
use txline_settlement::{
    BinaryExpression, Comparison, FixtureSummary, Predicate, ProofNode, StatTerm, ValidateStatArgs,
};

use crate::{constants::*, error::ElevenError, state::*};

/// How a market is resolved.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum ResolveKind {
    /// The committed predicate is proven TRUE via a `validate_stat` Merkle proof
    /// → outcome = yes.
    ProveYes,
    /// The provable event never happened by the resolve deadline → outcome = no.
    /// Gated purely on time; no operator asserts the result.
    TimeoutNo,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ResolveMarketArgs {
    pub market_index: u16,
    pub kind: ResolveKind,
    // ── validate_stat proof material (ProveYes only) ─────────────────────
    pub target_ts: i64,
    pub fixture_summary: FixtureSummary,
    pub fixture_proof: Vec<ProofNode>,
    pub main_tree_proof: Vec<ProofNode>,
    pub stat_a: StatTerm,
    pub stat_b: Option<StatTerm>,
    pub op: Option<BinaryExpression>,
}

#[derive(Accounts)]
pub struct ResolveMarket<'info> {
    /// Anyone may resolve — the outcome is proven cryptographically (or by a
    /// public timeout), so the caller is never trusted.
    pub settler: Signer<'info>,

    #[account(
        mut,
        seeds = [ROOM_SEED, room.authority.as_ref(), &room.room_id.to_le_bytes()],
        bump = room.bump,
    )]
    pub room: Account<'info, Room>,

    /// CHECK: address-checked against the verified TxOracle program id on every CPI.
    #[account(address = TXLINE_ORACLE_PROGRAM_ID @ ElevenError::InvalidOracleProgram)]
    pub txline_oracle: UncheckedAccount<'info>,

    /// CHECK: TxOracle `daily_scores_merkle_roots` PDA, forwarded read-only into
    /// the `validate_stat` CPI.
    pub daily_scores_roots: UncheckedAccount<'info>,
    // remaining_accounts: [prediction_0, participant_0, prediction_1, participant_1, …]
    // — exactly `market.reveal_count` pairs, sorted by owner, unique.
}

fn predicate_of(market: &Market) -> Predicate {
    let comparison = match market.comparison {
        0 => Comparison::GreaterThan,
        1 => Comparison::LessThan,
        _ => Comparison::EqualTo,
    };
    Predicate {
        threshold: market.threshold as i32,
        comparison,
    }
}

pub fn handle_resolve_market<'info>(
    ctx: Context<'info, ResolveMarket<'info>>,
    args: ResolveMarketArgs,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let idx = args.market_index as usize;

    // Snapshot the fields we need before taking a &mut on the room.
    let (reveal_count, resolved, resolve_deadline, yes_points, no_points, predicate) = {
        let market = ctx
            .accounts
            .room
            .markets
            .get(idx)
            .ok_or(ElevenError::BadMarketIndex)?;
        (
            market.reveal_count,
            market.resolved,
            market.resolve_deadline_ts,
            market.yes_points,
            market.no_points,
            predicate_of(market),
        )
    };
    require!(!resolved, ElevenError::MarketAlreadyResolved);

    // ── determine the outcome, trustlessly ───────────────────────────────
    let outcome = match args.kind {
        ResolveKind::ProveYes => {
            // The predicate proven is the market's COMMITTED predicate — not one
            // supplied by the caller — so no easier claim can be substituted.
            let vargs = ValidateStatArgs {
                target_ts: args.target_ts,
                fixture_summary: args.fixture_summary,
                fixture_proof: args.fixture_proof,
                main_tree_proof: args.main_tree_proof,
                predicate,
                stat_a: args.stat_a,
                stat_b: args.stat_b,
                op: args.op,
            };
            txline_settlement::verify_stat(
                &ctx.accounts.txline_oracle.to_account_info(),
                &ctx.accounts.daily_scores_roots.to_account_info(),
                &vargs,
            )?; // reverts if the Merkle proof / predicate does not hold
            true
        }
        ResolveKind::TimeoutNo => {
            require!(now >= resolve_deadline, ElevenError::TimeoutNotReached);
            false
        }
    };

    // ── score every revealed prediction (deterministic + complete) ───────
    let rem = ctx.remaining_accounts;
    require!(
        rem.len() == (reveal_count as usize) * 2,
        ElevenError::AccountCountMismatch,
    );
    let room_key = ctx.accounts.room.key();
    let award = if outcome { yes_points } else { no_points } as u64;
    let win_side: u8 = if outcome { 1 } else { 0 };

    let mut prev: Option<Pubkey> = None;
    for pair in rem.chunks(2) {
        let mut pred = Account::<Prediction>::try_from(&pair[0])
            .map_err(|_| error!(ElevenError::BadAccountOwner))?;
        let mut part = Account::<Participant>::try_from(&pair[1])
            .map_err(|_| error!(ElevenError::BadAccountOwner))?;

        // Canonical-PDA + membership checks.
        require_keys_eq!(pred.room, room_key, ElevenError::AccountMismatch);
        require!(pred.market_index as usize == idx, ElevenError::AccountMismatch);
        require!(pred.revealed && !pred.scored, ElevenError::AccountMismatch);
        require_keys_eq!(part.room, room_key, ElevenError::AccountMismatch);
        require_keys_eq!(part.owner, pred.owner, ElevenError::WalletMismatch);
        let (pred_pda, _) = Pubkey::find_program_address(
            &[PREDICTION_SEED, room_key.as_ref(), &args.market_index.to_le_bytes(), pred.owner.as_ref()],
            ctx.program_id,
        );
        require_keys_eq!(pred_pda, pair[0].key(), ElevenError::AccountMismatch);
        let (part_pda, _) = Pubkey::find_program_address(
            &[PARTICIPANT_SEED, room_key.as_ref(), part.owner.as_ref()],
            ctx.program_id,
        );
        require_keys_eq!(part_pda, pair[1].key(), ElevenError::AccountMismatch);

        // Strictly-increasing owner ⇒ no duplicate is scored twice.
        if let Some(p) = prev {
            require!(pred.owner > p, ElevenError::UnsortedOrDuplicate);
        }
        prev = Some(pred.owner);

        if pred.side == win_side {
            part.points = part.points.checked_add(award).ok_or(ElevenError::MathOverflow)?;
        }
        pred.scored = true;
        pred.exit(ctx.program_id)?;
        part.exit(ctx.program_id)?;
    }

    // ── commit the market resolution (exactly once) ──────────────────────
    let room = &mut ctx.accounts.room;
    let market = &mut room.markets[idx];
    market.resolved = true;
    market.outcome = outcome;
    room.resolved_market_count = room
        .resolved_market_count
        .checked_add(1)
        .ok_or(ElevenError::MathOverflow)?;

    msg!("resolve_market: idx {} outcome {}", idx, outcome);
    Ok(())
}
