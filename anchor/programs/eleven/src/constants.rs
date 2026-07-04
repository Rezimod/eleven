use anchor_lang::prelude::*;

/// Pool PDA seed: `[POOL_SEED, fixture_id.le(4), stat_key.le(2)]`.
#[constant]
pub const POOL_SEED: &[u8] = b"pool";

/// The TxOracle program `settle_pool` CPIs into. Defaulted to devnet for the
/// hackathon; swap to `txline_settlement::TXORACLE_MAINNET` for production.
/// (Both ids are verified in `docs/txline-notes.md`.)
pub const TXLINE_ORACLE_PROGRAM_ID: Pubkey = txline_settlement::TXORACLE_DEVNET;
