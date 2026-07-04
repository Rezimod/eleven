//! # txline-settlement
//!
//! Reusable, UI-agnostic settlement primitive for TxLINE (TxODDS) markets on
//! Solana. It defines the on-chain schema of the `validate_stat` proof
//! arguments (the exact shape returned by `GET /api/scores/stat-validation`)
//! and a CPI helper that verifies an outcome against TxLINE's on-chain daily
//! scores Merkle root **before** a caller releases escrow.
//!
//! Any market program can depend on this crate and call [`verify_stat`] to make
//! settlement trustless — the payout is gated on a signed Merkle proof, not on a
//! trusted operator.
//!
//! ## Interface
//!
//! ```ignore
//! txline_settlement::verify_stat(
//!     &ctx.accounts.txline_oracle,        // TxOracle program (address-checked)
//!     &ctx.accounts.daily_scores_roots,   // daily_scores_roots PDA (read-only)
//!     &[],                                 // TODO(idl): extra accounts once public
//!     &ValidateStatArgs { target_ts, fixture_summary, fixture_proof, main_tree_proof, predicate },
//! )?; // reverts if the proof/predicate does not hold
//! ```

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke,
};

/// Verified TxOracle program id — devnet. (docs: /documentation/programs/devnet)
pub const TXORACLE_DEVNET: Pubkey = pubkey!("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");
/// Verified TxOracle program id — mainnet. (docs: /documentation/programs/mainnet)
pub const TXORACLE_MAINNET: Pubkey = pubkey!("9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA");

/// PDA seed for TxOracle's per-epoch-day scores Merkle root (`dailyScoresMerkleRoots`).
/// Derivation lives on the TxOracle program:
///   seeds = [DAILY_SCORES_ROOTS_SEED, (epoch_day: u16).to_le_bytes()]
pub const DAILY_SCORES_ROOTS_SEED: &[u8] = b"daily_scores_roots";

/// Anchor instruction name for TxOracle's stat validation entrypoint.
pub const VALIDATE_STAT_IX_NAME: &str = "validate_stat";

/// Anchor global instruction discriminator for `validate_stat`
/// = `sha256("global:validate_stat")[..8]`. Anchor derives the callee's
/// discriminator identically at compile time, so this matches the real TxOracle
/// (and the `mock-txoracle` test double).
pub const VALIDATE_STAT_DISCRIMINATOR: [u8; 8] = [107, 197, 232, 90, 191, 136, 105, 185];

// ── Proof-argument schema (mirrors GET /api/scores/stat-validation) ──────────

/// `ScoresBatchSummary.updateStats` — bounds of the fixture's update window.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct ScoresUpdateStats {
    pub update_count: u32,
    pub min_timestamp: i64,
    pub max_timestamp: i64,
}

/// `ScoresBatchSummary` — the per-fixture summary that roots the event sub-tree.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct FixtureSummary {
    pub fixture_id: u32,
    pub update_stats: ScoresUpdateStats,
    /// `eventStatsSubTreeRoot`.
    pub event_stats_sub_tree_root: [u8; 32],
}

/// One Merkle authentication node. `is_right_sibling` says which side to fold on.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct ProofNode {
    pub hash: [u8; 32],
    pub is_right_sibling: bool,
}

/// How the proven stat is compared to the pool's threshold.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum Comparison {
    GreaterThan,
    LessThan,
    Equal,
}

/// The market's claim: `stat <comparison> threshold`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct Predicate {
    pub threshold: i64,
    pub comparison: Comparison,
}

/// Full argument bundle forwarded to `validate_stat`. Populate straight from the
/// `/api/scores/stat-validation` response (see the TS SDK in `src/lib/txline`).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct ValidateStatArgs {
    pub target_ts: i64,
    pub fixture_summary: FixtureSummary,
    /// `validation.subTreeProof` — leaf → fixture summary.
    pub fixture_proof: Vec<ProofNode>,
    /// `validation.mainTreeProof` — fixture summary → on-chain daily root.
    pub main_tree_proof: Vec<ProofNode>,
    pub predicate: Predicate,
}

// ── CPI machinery ────────────────────────────────────────────────────────────

/// Build the TxOracle `validate_stat` instruction (data = discriminator ++ borsh(args)).
///
/// Accounts:
///   [0] `daily_scores_roots` (read-only) — the only account confirmed by the
///        public docs. TODO(idl): `validate_stat` almost certainly takes more
///        accounts; their order isn't in the public IDL yet. Append them via
///        `extra_accounts` once known.
pub fn build_validate_stat_ix(
    oracle_program: Pubkey,
    daily_scores_roots: Pubkey,
    extra_accounts: &[AccountMeta],
    args: &ValidateStatArgs,
) -> Instruction {
    let mut data = VALIDATE_STAT_DISCRIMINATOR.to_vec();
    args.serialize(&mut data)
        .expect("ValidateStatArgs serialize into Vec is infallible");
    let mut accounts = vec![AccountMeta::new_readonly(daily_scores_roots, false)];
    accounts.extend_from_slice(extra_accounts);
    Instruction {
        program_id: oracle_program,
        accounts,
        data,
    }
}

/// CPI into TxOracle `validate_stat`. Propagates the callee's error, so on
/// `Ok(())` the proof verified and the caller may release escrow.
pub fn verify_stat<'info>(
    oracle_program: &AccountInfo<'info>,
    daily_scores_roots: &AccountInfo<'info>,
    extra_accounts: &[AccountInfo<'info>],
    args: &ValidateStatArgs,
) -> Result<()> {
    let mut metas = Vec::with_capacity(1 + extra_accounts.len());
    metas.push(AccountMeta::new_readonly(daily_scores_roots.key(), false));
    for a in extra_accounts {
        metas.push(AccountMeta::new_readonly(a.key(), a.is_signer));
    }

    let mut data = VALIDATE_STAT_DISCRIMINATOR.to_vec();
    args.serialize(&mut data)
        .map_err(|_| ProgramError::InvalidInstructionData)?;

    let ix = Instruction {
        program_id: oracle_program.key(),
        accounts: metas,
        data,
    };

    let mut infos = Vec::with_capacity(2 + extra_accounts.len());
    infos.push(oracle_program.clone());
    infos.push(daily_scores_roots.clone());
    infos.extend_from_slice(extra_accounts);

    invoke(&ix, &infos)?;
    Ok(())
}
