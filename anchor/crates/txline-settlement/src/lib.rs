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
//!     &ctx.accounts.daily_scores_roots,   // daily_scores_merkle_roots PDA (read-only)
//!     &ValidateStatArgs { ts, fixture_summary, fixture_proof, main_tree_proof, predicate, stat_a, stat_b, op },
//! )?; // reverts if the proof/predicate does not hold
//! ```
//!
//! ## Provenance
//!
//! The types and CPI shape below are pinned 1:1 to the official TxOracle IDL
//! (`txodds/tx-on-chain` → `idl/txoracle.json`, instruction `validate_stat`).
//! This resolves the earlier `TODO(idl)`: `validate_stat` takes exactly **one**
//! account (`daily_scores_merkle_roots`, read-only) and eight positional args,
//! the last three of which (`stat_a`, `stat_b`, `op`) were missing before.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke,
};

/// Verified TxOracle program id — devnet. (docs: /documentation/programs/devnet)
pub const TXORACLE_DEVNET: Pubkey = pubkey!("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");
/// Verified TxOracle program id — mainnet. (docs: /documentation/programs/mainnet)
pub const TXORACLE_MAINNET: Pubkey = pubkey!("9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA");

/// PDA seed for TxOracle's per-epoch-day scores Merkle root (`daily_scores_merkle_roots`).
/// Derivation lives on the TxOracle program:
///   seeds = [DAILY_SCORES_ROOTS_SEED, (epoch_day: u16).to_le_bytes()]
pub const DAILY_SCORES_ROOTS_SEED: &[u8] = b"daily_scores_roots";

/// Anchor instruction name for TxOracle's stat validation entrypoint.
pub const VALIDATE_STAT_IX_NAME: &str = "validate_stat";

/// Anchor global instruction discriminator for `validate_stat`
/// = `sha256("global:validate_stat")[..8]`. Matches `idl/txoracle.json`'s
/// `validate_stat` discriminator exactly, and Anchor derives the callee's
/// discriminator identically at compile time (real TxOracle + `mock-txoracle`).
pub const VALIDATE_STAT_DISCRIMINATOR: [u8; 8] = [107, 197, 232, 90, 191, 136, 105, 185];

// ── Proof-argument schema (1:1 with idl/txoracle.json `validate_stat`) ────────

/// IDL `ScoresUpdateStats` — bounds of the fixture's update window.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct ScoresUpdateStats {
    pub update_count: i32,
    pub min_timestamp: i64,
    pub max_timestamp: i64,
}

/// IDL `ScoresBatchSummary` — the per-fixture summary that roots the event sub-tree.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct FixtureSummary {
    pub fixture_id: i64,
    pub update_stats: ScoresUpdateStats,
    /// IDL `events_sub_tree_root`.
    pub events_sub_tree_root: [u8; 32],
}

/// One Merkle authentication node. `is_right_sibling` says which side to fold on.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct ProofNode {
    pub hash: [u8; 32],
    pub is_right_sibling: bool,
}

/// IDL `Comparison` — how the proven stat is compared to the pool's threshold.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum Comparison {
    GreaterThan,
    LessThan,
    EqualTo,
}

/// IDL `TraderPredicate` — the market's claim: `stat <comparison> threshold`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct Predicate {
    pub threshold: i32,
    pub comparison: Comparison,
}

/// IDL `ScoreStat` — the stat leaf being proven (`key` = stat kind, e.g. goals).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct ScoreStat {
    pub key: u32,
    pub value: i32,
    pub period: i32,
}

/// IDL `StatTerm` — one stat + its authentication path to the event sub-tree root.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct StatTerm {
    pub stat_to_prove: ScoreStat,
    pub event_stat_root: [u8; 32],
    pub stat_proof: Vec<ProofNode>,
}

/// IDL `BinaryExpression` — combinator for two-stat predicates (e.g. score diff).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum BinaryExpression {
    Add,
    Subtract,
}

/// Full argument bundle forwarded to `validate_stat`, in IDL order. Populate
/// straight from the `/api/scores/stat-validation` response (see the TS SDK in
/// `src/lib/txline`). `stat_b`/`op` are set only for two-stat predicates; a
/// single-stat market (e.g. "next goal") leaves them `None`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct ValidateStatArgs {
    /// IDL arg `ts`.
    pub target_ts: i64,
    pub fixture_summary: FixtureSummary,
    /// `validation.subTreeProof` — leaf → fixture summary.
    pub fixture_proof: Vec<ProofNode>,
    /// `validation.mainTreeProof` — fixture summary → on-chain daily root.
    pub main_tree_proof: Vec<ProofNode>,
    pub predicate: Predicate,
    /// `validation.{statToProve,eventStatRoot,statProof}` — the proven stat.
    pub stat_a: StatTerm,
    /// Second stat for binary predicates; `None` for single-stat markets.
    pub stat_b: Option<StatTerm>,
    /// Operator combining `stat_a`/`stat_b`; `None` for single-stat markets.
    pub op: Option<BinaryExpression>,
}

// ── CPI machinery ────────────────────────────────────────────────────────────

/// Build the TxOracle `validate_stat` instruction (data = discriminator ++ borsh(args)).
///
/// Accounts (per `idl/txoracle.json`): exactly one — `daily_scores_merkle_roots`
/// (read-only). The IDL declares no further accounts, so none are appended.
pub fn build_validate_stat_ix(
    oracle_program: Pubkey,
    daily_scores_roots: Pubkey,
    args: &ValidateStatArgs,
) -> Instruction {
    let mut data = VALIDATE_STAT_DISCRIMINATOR.to_vec();
    args.serialize(&mut data)
        .expect("ValidateStatArgs serialize into Vec is infallible");
    Instruction {
        program_id: oracle_program,
        accounts: vec![AccountMeta::new_readonly(daily_scores_roots, false)],
        data,
    }
}

/// CPI into TxOracle `validate_stat`. Propagates the callee's error, so on
/// `Ok(())` the proof verified and the caller may release escrow.
pub fn verify_stat<'info>(
    oracle_program: &AccountInfo<'info>,
    daily_scores_roots: &AccountInfo<'info>,
    args: &ValidateStatArgs,
) -> Result<()> {
    let mut data = VALIDATE_STAT_DISCRIMINATOR.to_vec();
    args.serialize(&mut data)
        .map_err(|_| ProgramError::InvalidInstructionData)?;

    let ix = Instruction {
        program_id: oracle_program.key(),
        accounts: vec![AccountMeta::new_readonly(daily_scores_roots.key(), false)],
        data,
    };

    invoke(&ix, &[oracle_program.clone(), daily_scores_roots.clone()])?;
    Ok(())
}
