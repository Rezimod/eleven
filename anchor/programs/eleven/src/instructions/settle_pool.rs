use anchor_lang::prelude::*;
use txline_settlement::{Comparison, FixtureSummary, Predicate, ProofNode, ValidateStatArgs};

use crate::{constants::*, error::ElevenError, state::Pool};

#[derive(Accounts)]
pub struct SettlePool<'info> {
    #[account(
        mut,
        seeds = [
            POOL_SEED,
            &pool.fixture_id.to_le_bytes(),
            &pool.stat_key.to_le_bytes(),
        ],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    /// CHECK: receives the escrow; constrained to the pool's recorded winner.
    #[account(mut, address = pool.winner @ ElevenError::WinnerMismatch)]
    pub winner: UncheckedAccount<'info>,

    /// Anyone may trigger settlement once the deadline passes — the outcome is
    /// proven cryptographically, so the caller is not trusted.
    pub settler: Signer<'info>,

    /// CHECK: the TxOracle program; address-checked against the verified id.
    #[account(address = TXLINE_ORACLE_PROGRAM_ID @ ElevenError::InvalidOracleProgram)]
    pub txline_oracle: UncheckedAccount<'info>,

    /// CHECK: TxOracle `dailyScoresMerkleRoots` PDA, forwarded read-only into the
    /// `validate_stat` CPI. Its derivation lives on the TxOracle program:
    ///   seeds = [b"daily_scores_roots", (epoch_day: u16).to_le_bytes()]
    pub daily_scores_roots: UncheckedAccount<'info>,
}

fn comparison_code(c: &Comparison) -> u8 {
    match c {
        Comparison::GreaterThan => 0,
        Comparison::LessThan => 1,
        Comparison::Equal => 2,
    }
}

pub fn handle_settle_pool(
    ctx: Context<SettlePool>,
    target_ts: i64,
    fixture_summary: FixtureSummary,
    fixture_proof: Vec<ProofNode>,
    main_tree_proof: Vec<ProofNode>,
    predicate: Predicate,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    {
        let pool = &ctx.accounts.pool;
        require!(!pool.settled, ElevenError::PoolAlreadySettled);
        require!(now >= pool.deadline_ts, ElevenError::DeadlineNotReached);
        // Bind the caller-supplied predicate to what the market committed to, so
        // no one can settle against an easier claim than the pool was opened on.
        require!(
            predicate.threshold == pool.threshold
                && comparison_code(&predicate.comparison) == pool.comparison,
            ElevenError::PredicateMismatch,
        );
    }

    // Trustless gate: CPI into TxOracle `validate_stat`. Reverts (propagated) if
    // the Merkle proof / predicate does not hold against the on-chain root.
    let args = ValidateStatArgs {
        target_ts,
        fixture_summary,
        fixture_proof,
        main_tree_proof,
        predicate,
    };
    txline_settlement::verify_stat(
        &ctx.accounts.txline_oracle.to_account_info(),
        &ctx.accounts.daily_scores_roots.to_account_info(),
        &[], // TODO(idl): extra validate_stat accounts once the public IDL lands
        &args,
    )?;

    // Proof held → release escrow to the winner (native lamports in V1; swap for
    // a USDC SPL transfer in production — the gating above is unchanged).
    let amount = ctx.accounts.pool.stake_lamports;
    **ctx.accounts.pool.to_account_info().try_borrow_mut_lamports()? -= amount;
    **ctx.accounts.winner.to_account_info().try_borrow_mut_lamports()? += amount;

    let pool = &mut ctx.accounts.pool;
    pool.settled = true;
    pool.outcome = true;
    pool.stake_lamports = 0;

    msg!(
        "settle_pool: fixture {} settled; {} lamports released to winner",
        pool.fixture_id,
        amount,
    );
    Ok(())
}
