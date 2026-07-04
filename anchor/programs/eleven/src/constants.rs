use anchor_lang::prelude::*;

/// Seed for a prediction Pool PDA: [POOL_SEED, fixture_id.le, stat_key.le].
#[constant]
pub const POOL_SEED: &[u8] = b"pool";

/// TxLINE "TxOracle" program that holds the daily scores Merkle roots and
/// exposes `validate_stat` / `validate_fixture` / `validate_odds`.
/// Docs: https://txline.txodds.com/documentation/programs/addresses
///   devnet  6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J
///   mainnet 9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA
/// Defaulted to devnet for the hackathon build.
pub const TXLINE_ORACLE_PROGRAM_ID: Pubkey =
    pubkey!("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");

/// TxLINE PDA seed for the per-epoch-day scores Merkle root account
/// (`dailyScoresMerkleRoots`). Full derivation lives on the TxOracle program:
///   seeds = [TXLINE_DAILY_SCORES_ROOTS_SEED, (epoch_day: u16).to_le_bytes()]
#[constant]
pub const TXLINE_DAILY_SCORES_ROOTS_SEED: &[u8] = b"daily_scores_roots";
