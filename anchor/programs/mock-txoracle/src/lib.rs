//! Test-only stand-in for the TxLINE **TxOracle** program.
//!
//! It exposes a `validate_stat` instruction with the exact same discriminator
//! and argument schema (`txline_settlement::ValidateStatArgs`) that `eleven`'s
//! settlement CPI produces, so the whole "verify proof → release escrow" path
//! can be exercised in litesvm without the real oracle.
//!
//! Verification rule (stand-in for real Merkle verification): accept iff both
//! proofs are non-empty. That lets tests drive the happy path (supply proofs)
//! and the bad-proof reject path (supply empty proofs) deterministically.
//!
//! In the test the compiled bytes are loaded at the real devnet TxOracle
//! address (`txline_settlement::TXORACLE_DEVNET`).

use anchor_lang::prelude::*;
use txline_settlement::ValidateStatArgs;

declare_id!("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");

#[program]
pub mod mock_txoracle {
    use super::*;

    pub fn validate_stat(ctx: Context<ValidateStat>, args: ValidateStatArgs) -> Result<()> {
        // Stand-in for verifying `fixture_proof` (leaf→summary) and
        // `main_tree_proof` (summary→on-chain root) against
        // `daily_scores_roots`. Real TxOracle recomputes and compares roots.
        let _ = &ctx.accounts.daily_scores_roots;
        require!(
            !args.fixture_proof.is_empty() && !args.main_tree_proof.is_empty(),
            MockOracleError::InvalidProof
        );
        Ok(())
    }
}

#[derive(Accounts)]
pub struct ValidateStat<'info> {
    /// CHECK: mirrors TxOracle's `dailyScoresMerkleRoots` PDA (read-only).
    pub daily_scores_roots: UncheckedAccount<'info>,
}

#[error_code]
pub enum MockOracleError {
    #[msg("mock: Merkle proof did not verify")]
    InvalidProof,
}
