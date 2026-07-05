use anchor_lang::prelude::*;

/// Room lifecycle state.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum RoomState {
    /// Accepting joins / predictions.
    Open,
    /// Pot paid out to the winner(s); terminal.
    Settled,
    /// Buy-ins are being refunded (unfilled or voided); terminal for the pot.
    Refunding,
}

/// One provable market inside a room — a `validate_stat` predicate over a stat
/// TxLINE proves (goals / corners / cards). Stored inline in the Room so a room
/// is one atomic unit (smaller attack surface than N market accounts).
///
/// A market is `yes` iff the committed predicate holds:
///   `has_second == false` → `stat(key,period) <cmp> threshold`
///   `has_second == true`  → `(stat_a <op> stat_b) <cmp> threshold`   (e.g. A goals − B goals > 0)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug, InitSpace)]
pub struct Market {
    pub stat_key: u16,
    pub period: u16,
    /// Predicate threshold (compared as i32 on-chain, per the TxOracle IDL).
    pub threshold: i64,
    /// 0 = GreaterThan, 1 = LessThan, 2 = EqualTo.
    pub comparison: u8,
    /// Two-stat predicate (e.g. "Team A goals > Team B goals").
    pub has_second: bool,
    pub stat_key2: u16,
    pub period2: u16,
    /// 0 = Add, 1 = Subtract (only when `has_second`).
    pub op: u8,
    /// Commit + reveal must both land before this — the on-chain lock.
    pub lock_ts: i64,
    /// A `no` (timeout) resolution is only allowed once this has passed.
    pub resolve_deadline_ts: i64,
    /// Points a correct `yes`/`no` predictor earns — scaled by odds off-chain,
    /// applied verbatim on-chain (longer odds → more points). Stake never adds.
    pub yes_points: u32,
    pub no_points: u32,
    /// Number of revealed predictions — `resolve_market` must score exactly this many.
    pub reveal_count: u16,
    pub resolved: bool,
    /// The proven outcome: true = predicate held (`yes`), false = did not (`no`).
    pub outcome: bool,
}

/// A prediction room: a fixed buy-in tournament over one fixture's markets.
#[account]
#[derive(InitSpace)]
pub struct Room {
    pub authority: Pubkey,
    /// Where rake is sent at settlement (set at creation; capped by MAX_RAKE_BPS).
    pub treasury: Pubkey,
    pub room_id: u64,
    pub fixture_id: u32,
    /// Fixed buy-in every player pays (0 = free-play, points only, no escrow).
    pub buy_in_lamports: u64,
    pub rake_bps: u16,
    pub max_players: u16,
    pub player_count: u16,
    /// Joins close here; must be before the first market lock.
    pub join_deadline_ts: i64,
    /// Full time — `settle_room` is only allowed after this.
    pub end_ts: i64,
    /// Timelock: after this an unsettled room can be refunded.
    pub refund_deadline_ts: i64,
    /// Total escrow held in this account (on top of rent) = buy_in × players.
    pub pot_lamports: u64,
    pub resolved_market_count: u16,
    pub state: RoomState,
    pub settled: bool,
    #[max_len(8)]
    pub markets: Vec<Market>,
    pub bump: u8,
}

/// A player in a room. Points start at 0 and only rise from correct predictions.
#[account]
#[derive(InitSpace)]
pub struct Participant {
    pub room: Pubkey,
    pub owner: Pubkey,
    /// Earned strictly from correct, revealed predictions — never from stake.
    pub points: u64,
    /// Exact buy-in escrowed (for a precise refund).
    pub buy_in_paid: u64,
    pub refunded: bool,
    pub bump: u8,
}

/// A single player's commit-reveal prediction on one market.
#[account]
#[derive(InitSpace)]
pub struct Prediction {
    pub room: Pubkey,
    pub owner: Pubkey,
    pub market_index: u16,
    /// sha256(side_byte ++ salt) — fixed before the lock; hides the pick.
    pub commitment: [u8; 32],
    pub revealed: bool,
    /// 0 = no (predicate won't hold), 1 = yes (predicate will hold).
    pub side: u8,
    pub scored: bool,
    pub bump: u8,
}
