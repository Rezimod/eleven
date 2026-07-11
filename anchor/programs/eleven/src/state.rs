use anchor_lang::prelude::*;

/// Room phase — the on-chain state machine: Lobby → Live → FullTime → Settled.
/// `Refunding` is the void branch (unfilled/timed-out) off Lobby/Live.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum RoomPhase {
    /// Before kickoff: create/join + PRE-MATCH predictions on the match-long menu.
    Lobby,
    /// After kickoff: pre-match markets are locked; the generator opens live waves.
    Live,
    /// After `end_ts`: all markets resolvable; awaiting settlement.
    FullTime,
    /// Pot paid to the winner(s); terminal.
    Settled,
    /// Buy-ins being refunded (unfilled or voided); terminal for the pot.
    Refunding,
}

impl RoomPhase {
    /// Phase implied by the clock — Lobby before kickoff, Live in play, FullTime at
    /// end. Terminal phases (Settled/Refunding) are sticky and never recomputed.
    pub fn from_clock(self, now: i64, kickoff_ts: i64, end_ts: i64) -> RoomPhase {
        match self {
            RoomPhase::Settled | RoomPhase::Refunding => self,
            _ if now >= end_ts => RoomPhase::FullTime,
            _ if now >= kickoff_ts => RoomPhase::Live,
            _ => RoomPhase::Lobby,
        }
    }
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
    /// Frozen onto each prediction at reveal (`Prediction.award_points`), capped.
    pub yes_points: u32,
    pub no_points: u32,
    /// Number of revealed predictions — `resolve_market` must score exactly this many.
    pub reveal_count: u16,
    pub resolved: bool,
    /// The proven outcome: true = predicate held (`yes`), false = did not (`no`).
    pub outcome: bool,
    /// PRE-MATCH (false) vs LIVE-WAVE (true). Pre-match markets lock at kickoff and
    /// use per-player commit/reveal; live markets use a per-lock Merkle root of
    /// picks (no per-bet transaction) and are scored via `reveal_live_pick`.
    pub is_live: bool,
    /// LIVE only: the per-lock Merkle root of that wave's pick commitments,
    /// committed on-chain at the lock. Picks reveal against it at settlement.
    pub commit_root: [u8; 32],
    pub root_committed: bool,
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
    /// Kickoff — every PRE-MATCH market locks here (enforced on-chain). Lobby → Live.
    pub kickoff_ts: i64,
    /// Full time — `settle_room` is only allowed after this. Live → FullTime.
    pub end_ts: i64,
    /// Timelock: after this an unsettled room can be refunded.
    pub refund_deadline_ts: i64,
    /// Total escrow held in this account (on top of rent) = buy_in × players.
    pub pot_lamports: u64,
    pub resolved_market_count: u16,
    /// The on-chain state machine: Lobby → Live → FullTime → Settled (or Refunding).
    pub phase: RoomPhase,
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
    /// Signed: a wrong pick costs a small penalty (`WRONG_PICK_PENALTY_BPS` of
    /// its frozen award), so totals can dip below zero. Winner is still max.
    pub points: i64,
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
    /// FROZEN odds snapshot: the points this pick earns if correct, snapshotted at
    /// reveal (clamped to `MAX_POINTS_PER_MARKET`) and NEVER recomputed. Scoring
    /// reads this, so stake — or a later, bigger bet — can never change it.
    pub award_points: u32,
    pub bump: u8,
}

/// Dedup guard for a LIVE pick revealed against a market's Merkle root — its mere
/// existence proves this (owner, market) already scored, so a pick can't be
/// revealed twice. Created by `reveal_live_pick`.
#[account]
#[derive(InitSpace)]
pub struct LivePick {
    pub room: Pubkey,
    pub owner: Pubkey,
    pub market_index: u16,
    /// Frozen points this pick locked (already clamped); mirrored for auditing.
    pub award_points: u32,
    pub bump: u8,
}
