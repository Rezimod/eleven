use anchor_lang::prelude::*;

/// Room PDA seed: `[ROOM_SEED, authority, room_id.le(8)]`.
#[constant]
pub const ROOM_SEED: &[u8] = b"room";
/// Participant PDA seed: `[PARTICIPANT_SEED, room, owner]`.
#[constant]
pub const PARTICIPANT_SEED: &[u8] = b"participant";
/// Prediction PDA seed: `[PREDICTION_SEED, room, market_index.le(2), owner]`.
#[constant]
pub const PREDICTION_SEED: &[u8] = b"prediction";
/// LivePick PDA seed: `[LIVE_PICK_SEED, room, market_index.le(2), owner]` — the
/// once-only guard for a live pick revealed against a market's Merkle root.
#[constant]
pub const LIVE_PICK_SEED: &[u8] = b"livepick";

/// Rake is capped on-chain at 10% (basis points). No room can charge more.
pub const MAX_RAKE_BPS: u16 = 1_000;
/// A room needs at least this many players to run (else it refunds).
pub const MIN_PLAYERS: u16 = 2;
/// Hard cap on players — bounds `settle_room`/`resolve_market` account lists so
/// the settlement transaction always fits.
pub const MAX_PLAYERS: u16 = 16;
/// Hard cap on markets per room — bounds Room account size.
pub const MAX_MARKETS: usize = 8;

/// ANTI-DRAIN: the most points a single market can award a player. A longshot's
/// frozen odds snapshot is clamped to this at reveal, so no one market can
/// dominate the pot. Matches the core engine's `MAX_MARKET_POINTS`.
pub const MAX_POINTS_PER_MARKET: u32 = 1_000;

/// The TxOracle program `resolve_market` CPIs into (devnet for the hackathon;
/// swap to `txline_settlement::TXORACLE_MAINNET` for production). Verified in
/// `docs/txline-notes.md` and the vendored IDL `anchor/idl/txoracle.json`.
pub const TXLINE_ORACLE_PROGRAM_ID: Pubkey = txline_settlement::TXORACLE_DEVNET;
