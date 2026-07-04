use anchor_lang::prelude::*;

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

    /// Anyone may trigger settlement once the deadline passes — the outcome is
    /// proven cryptographically, so the caller is not trusted.
    pub settler: Signer<'info>,

    /// CHECK: The TxLINE (TxOracle) program that exposes `validate_stat`.
    /// Address-checked against the documented program id (see constants).
    ///   devnet  6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J
    ///   mainnet 9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA
    #[account(address = TXLINE_ORACLE_PROGRAM_ID @ ElevenError::InvalidOracleProgram)]
    pub txline_oracle: UncheckedAccount<'info>,

    /// CHECK: TxLINE `dailyScoresMerkleRoots` PDA holding the on-chain Merkle
    /// root for the fixture's epoch day. Derived on the TxOracle program:
    ///   seeds  = [b"daily_scores_roots", (epoch_day: u16).to_le_bytes()]
    ///   program = txline_oracle
    /// Forwarded read-only into the `validate_stat` CPI.
    pub daily_scores_roots: UncheckedAccount<'info>,
}

pub fn handle_settle_pool(ctx: Context<SettlePool>, target_ts: i64) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    require!(!pool.settled, ElevenError::PoolAlreadySettled);
    require!(
        Clock::get()?.unix_timestamp >= pool.deadline_ts,
        ElevenError::DeadlineNotReached,
    );

    // ── TODO: CPI into TxLINE `validate_stat` before releasing escrow ──────────
    // Settlement must PROVE the pool's predicate against TxLINE's on-chain daily
    // scores Merkle root rather than trusting any off-chain caller.
    //
    // Program id  → constants::TXLINE_ORACLE_PROGRAM_ID
    //   devnet  6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J
    //   mainnet 9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA
    //
    // Accounts (docs: examples/onchain-validation):
    //   [0] daily_scores_roots  (PDA, read-only)  → ctx.accounts.daily_scores_roots
    //         seeds = [b"daily_scores_roots", (epoch_day: u16).to_le_bytes()]
    //
    // Args, in order — fetched from GET /api/scores/stat-validation:
    //   target_ts       : i64                 (this instruction's `target_ts`)
    //   fixture_summary : { fixtureId, updateStats, eventStatsSubTreeRoot }
    //   fixture_proof   : Vec<ProofNode>      // validation.subTreeProof
    //   main_tree_proof : Vec<ProofNode>      // validation.mainTreeProof
    //   predicate       : { threshold: pool.threshold, comparison: pool.comparison }
    //   stat1           : { statToProve, eventStatRoot, statProof }
    //   stat2           : Option<Stat>        // two-stat predicates (e.g. score diff)
    //   operator        : Option<Operator>    // e.g. Subtract for goal difference
    //
    // Once the TxLINE IDL is vendored (declare_program!/generated cpi crate),
    // replace the stub below with the real CPI and derive `outcome` from it:
    //
    //   let cpi_ctx = CpiContext::new(
    //       ctx.accounts.txline_oracle.to_account_info(),
    //       txline_cpi::accounts::ValidateStat {
    //           daily_scores_merkle_roots: ctx.accounts.daily_scores_roots.to_account_info(),
    //       },
    //   );
    //   // reverts if the Merkle proof / predicate does not hold:
    //   txline_cpi::validate_stat(cpi_ctx, target_ts, fixture_summary, /* … */)?;
    //   pool.outcome = true;
    //
    // Then release the USDC escrow (anchor-spl token transfer, escrow_vault → winners).
    // ───────────────────────────────────────────────────────────────────────────
    let _ = target_ts;
    let _ = &ctx.accounts.txline_oracle;
    let _ = &ctx.accounts.daily_scores_roots;

    // Stub: mark settled WITHOUT releasing escrow. Real payout is gated on the
    // `validate_stat` CPI above landing.
    pool.settled = true;
    msg!(
        "settle_pool STUB: fixture {} stat {} marked settled (escrow NOT released — awaiting validate_stat CPI)",
        pool.fixture_id,
        pool.stat_key,
    );
    Ok(())
}
