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

/// Rake is capped on-chain at 10% (basis points). No room can charge more.
pub const MAX_RAKE_BPS: u16 = 1_000;
/// A room needs at least this many players to run (else it refunds).
pub const MIN_PLAYERS: u16 = 2;
/// Hard cap on players — bounds `settle_room`/`resolve_market` account lists so
/// the settlement transaction always fits.
pub const MAX_PLAYERS: u16 = 16;
/// Hard cap on markets per room — bounds Room account size.
pub const MAX_MARKETS: usize = 8;

/// The TxOracle program `resolve_market` CPIs into (devnet for the hackathon;
/// swap to `txline_settlement::TXORACLE_MAINNET` for production). Verified in
/// `docs/txline-notes.md` and the vendored IDL `anchor/idl/txoracle.json`.
pub const TXLINE_ORACLE_PROGRAM_ID: Pubkey = txline_settlement::TXORACLE_DEVNET;
