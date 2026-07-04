use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

use crate::{constants::*, error::ElevenError, state::Pool};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CreatePoolArgs {
    pub fixture_id: u32,
    pub stat_key: u16,
    pub period: u16,
    pub threshold: i64,
    /// 0 = GreaterThan, 1 = LessThan, 2 = Equal.
    pub comparison: u8,
    pub deadline_ts: i64,
    pub stake_lamports: u64,
    /// Recipient paid the escrow iff the predicate is proven true.
    pub winner: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: CreatePoolArgs)]
pub struct CreatePool<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        space = 8 + Pool::INIT_SPACE,
        seeds = [
            POOL_SEED,
            &args.fixture_id.to_le_bytes(),
            &args.stat_key.to_le_bytes(),
        ],
        bump,
    )]
    pub pool: Account<'info, Pool>,

    pub system_program: Program<'info, System>,
}

pub fn handle_create_pool(ctx: Context<CreatePool>, args: CreatePoolArgs) -> Result<()> {
    require!(args.stake_lamports > 0, ElevenError::ZeroStake);

    let pool = &mut ctx.accounts.pool;
    pool.authority = ctx.accounts.creator.key();
    pool.winner = args.winner;
    pool.fixture_id = args.fixture_id;
    pool.stat_key = args.stat_key;
    pool.period = args.period;
    pool.threshold = args.threshold;
    pool.comparison = args.comparison;
    pool.deadline_ts = args.deadline_ts;
    pool.stake_lamports = args.stake_lamports;
    pool.settled = false;
    pool.outcome = false;
    pool.bump = ctx.bumps.pool;

    // Escrow the stake into the pool account (on top of its rent).
    transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            Transfer {
                from: ctx.accounts.creator.to_account_info(),
                to: ctx.accounts.pool.to_account_info(),
            },
        ),
        args.stake_lamports,
    )?;

    msg!(
        "create_pool: fixture {} stat {} threshold {} cmp {} stake {}",
        args.fixture_id,
        args.stat_key,
        args.threshold,
        args.comparison,
        args.stake_lamports,
    );
    Ok(())
}
