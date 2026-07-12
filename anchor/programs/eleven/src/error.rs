use anchor_lang::prelude::*;

#[error_code]
pub enum ElevenError {
    // ── config / lifecycle ──────────────────────────────────────────────────
    #[msg("Rake exceeds the on-chain maximum (10%)")]
    RakeTooHigh,
    #[msg("Player count must be between MIN_PLAYERS and MAX_PLAYERS")]
    BadPlayerCount,
    #[msg("Market list is empty or exceeds MAX_MARKETS")]
    BadMarketCount,
    #[msg("Deadlines are not correctly ordered")]
    BadDeadlines,
    #[msg("Market points must be positive")]
    BadPoints,
    #[msg("Room is not in the expected state")]
    BadRoomState,
    #[msg("Room is already settled")]
    RoomAlreadySettled,
    #[msg("Join window has closed")]
    JoinClosed,
    #[msg("Room is full")]
    RoomFull,

    // ── markets / predictions ───────────────────────────────────────────────
    #[msg("Market index out of range")]
    BadMarketIndex,
    #[msg("Prediction window is locked")]
    MarketLocked,
    #[msg("Market has already been resolved")]
    MarketAlreadyResolved,
    #[msg("Not all markets have been resolved yet")]
    MarketsUnresolved,
    #[msg("Prediction already revealed")]
    AlreadyRevealed,
    #[msg("Reveal does not match the committed hash")]
    BadReveal,
    #[msg("Invalid prediction side (must be 0 or 1)")]
    BadSide,
    #[msg("A pre-match market must lock exactly at kickoff")]
    PreMatchLockNotKickoff,
    #[msg("Expected a live-wave market")]
    NotLiveMarket,
    #[msg("Expected a pre-match market")]
    NotPreMatchMarket,
    #[msg("Live wave root already committed")]
    RootAlreadyCommitted,
    #[msg("Live wave root not committed")]
    RootNotCommitted,
    #[msg("Live pick does not verify against the committed Merkle root")]
    BadMerkleProof,
    #[msg("Frozen points exceed the per-market cap")]
    PointsCapExceeded,
    #[msg("Market has not been resolved yet")]
    MarketNotResolved,
    #[msg("Room is not in the expected phase")]
    WrongPhase,

    // ── settlement / proofs ─────────────────────────────────────────────────
    #[msg("Provided oracle account does not match the TxLINE program id")]
    InvalidOracleProgram,
    #[msg("Provided predicate does not match the market's committed predicate")]
    PredicateMismatch,
    #[msg("Timeout resolution requires the resolve deadline to have passed")]
    TimeoutNotReached,
    #[msg("Full time has not been reached yet")]
    EndNotReached,

    // ── remaining-account plumbing ──────────────────────────────────────────
    #[msg("Wrong number of scoring/settlement accounts supplied")]
    AccountCountMismatch,
    #[msg("A supplied account is not owned by this program")]
    BadAccountOwner,
    #[msg("Accounts must be sorted by owner and unique")]
    UnsortedOrDuplicate,
    #[msg("A supplied account does not belong to this room/market")]
    AccountMismatch,
    #[msg("Wallet does not match the participant owner")]
    WalletMismatch,
    #[msg("Treasury account does not match the room treasury")]
    TreasuryMismatch,

    // ── refund ──────────────────────────────────────────────────────────────
    #[msg("Refund is not available yet")]
    RefundNotAvailable,
    #[msg("Participant already refunded")]
    AlreadyRefunded,

    // ── math ────────────────────────────────────────────────────────────────
    #[msg("Arithmetic overflow")]
    MathOverflow,
}
