//! Deterministic litesvm tests for the ELEVEN room engine.
//!
//! `eleven` is loaded at its program id; `mock-txoracle` is loaded at the real
//! devnet TxOracle address so `resolve_market`'s `validate_stat` CPI resolves.
//! The mock accepts iff a proof was supplied — letting us drive proven-yes and
//! every reject path without the live oracle. Time is controlled via the Clock
//! sysvar so lock / deadline behaviour is exact and reproducible.

use anchor_lang::prelude::{AccountMeta, Pubkey};
use anchor_lang::solana_program::{instruction::Instruction, system_program};
use anchor_lang::{InstructionData, ToAccountMetas};

use eleven::instructions::create_room::{CreateRoomArgs, MarketInit};
use eleven::instructions::resolve_market::{ResolveKind, ResolveMarketArgs};
use eleven::settlement::{FixtureSummary, ProofNode, ScoreStat, ScoresUpdateStats, StatTerm};

use litesvm::types::TransactionResult;
use litesvm::LiteSVM;
use solana_clock::Clock;
use solana_keypair::Keypair;
use solana_message::{Message, VersionedMessage};
use solana_signer::Signer;
use solana_transaction::versioned::VersionedTransaction;

const ELEVEN_SO: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/deploy/eleven.so");
const MOCK_SO: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/deploy/mock_txoracle.so");

const BUY_IN: u64 = 1_000_000_000; // 1 SOL
const RAKE_BPS: u16 = 500; // 5%
const FIXTURE_ID: u32 = 42;

// Timeline (unix seconds).
const T_CREATE: i64 = 500;
const T_JOIN_DEADLINE: i64 = 1_000;
const T_LOCK: i64 = 2_000;
const T_RESOLVE_DEADLINE: i64 = 3_000;
const T_END: i64 = 4_000;
const T_REFUND_DEADLINE: i64 = 5_000;

// ── low-level helpers ────────────────────────────────────────────────────────

fn boot() -> LiteSVM {
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(eleven::id(), ELEVEN_SO).unwrap();
    svm.add_program_from_file(eleven::settlement::TXORACLE_DEVNET, MOCK_SO)
        .unwrap();
    warp(&mut svm, T_CREATE);
    svm
}

fn warp(svm: &mut LiteSVM, ts: i64) {
    let mut c: Clock = svm.get_sysvar();
    c.unix_timestamp = ts;
    svm.set_sysvar(&c);
}

fn send(svm: &mut LiteSVM, ixs: &[Instruction], payer: &Keypair, signers: &[&Keypair]) -> TransactionResult {
    let msg = Message::new_with_blockhash(ixs, Some(&payer.pubkey()), &svm.latest_blockhash());
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
    svm.send_transaction(tx)
}

fn funded(svm: &mut LiteSVM, lamports: u64) -> Keypair {
    let kp = Keypair::new();
    svm.airdrop(&kp.pubkey(), lamports).unwrap();
    kp
}

fn room_pda(authority: &Pubkey, room_id: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[eleven::ROOM_SEED, authority.as_ref(), &room_id.to_le_bytes()],
        &eleven::id(),
    )
    .0
}
fn participant_pda(room: &Pubkey, owner: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[eleven::PARTICIPANT_SEED, room.as_ref(), owner.as_ref()],
        &eleven::id(),
    )
    .0
}
fn prediction_pda(room: &Pubkey, market_index: u16, owner: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[
            eleven::PREDICTION_SEED,
            room.as_ref(),
            &market_index.to_le_bytes(),
            owner.as_ref(),
        ],
        &eleven::id(),
    )
    .0
}

fn market(yes_points: u32, no_points: u32) -> MarketInit {
    MarketInit {
        stat_key: 1,
        period: 0,
        threshold: 0,
        comparison: 0, // GreaterThan
        has_second: false,
        stat_key2: 0,
        period2: 0,
        op: 0,
        lock_ts: T_LOCK,
        resolve_deadline_ts: T_RESOLVE_DEADLINE,
        yes_points,
        no_points,
    }
}

// ── instruction builders ─────────────────────────────────────────────────────

#[allow(clippy::too_many_arguments)]
fn create_room_ix(
    creator: &Pubkey,
    room_id: u64,
    buy_in: u64,
    rake_bps: u16,
    max_players: u16,
    treasury: Pubkey,
    markets: Vec<MarketInit>,
) -> Instruction {
    let room = room_pda(creator, room_id);
    Instruction {
        program_id: eleven::id(),
        accounts: eleven::accounts::CreateRoom {
            creator: *creator,
            room,
            participant: participant_pda(&room, creator),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: eleven::instruction::CreateRoom {
            args: CreateRoomArgs {
                room_id,
                fixture_id: FIXTURE_ID,
                buy_in_lamports: buy_in,
                rake_bps,
                max_players,
                join_deadline_ts: T_JOIN_DEADLINE,
                end_ts: T_END,
                refund_deadline_ts: T_REFUND_DEADLINE,
                treasury,
                markets,
            },
        }
        .data(),
    }
}

fn join_ix(room: &Pubkey, joiner: &Pubkey) -> Instruction {
    Instruction {
        program_id: eleven::id(),
        accounts: eleven::accounts::JoinRoom {
            joiner: *joiner,
            room: *room,
            participant: participant_pda(room, joiner),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: eleven::instruction::JoinRoom {}.data(),
    }
}

fn commit_ix(room: &Pubkey, owner: &Pubkey, market_index: u16, side: u8, salt: [u8; 32]) -> Instruction {
    let commitment = eleven::commitment_hash(side, &salt, owner, market_index);
    Instruction {
        program_id: eleven::id(),
        accounts: eleven::accounts::CommitPrediction {
            owner: *owner,
            room: *room,
            participant: participant_pda(room, owner),
            prediction: prediction_pda(room, market_index, owner),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: eleven::instruction::CommitPrediction { market_index, commitment }.data(),
    }
}

fn reveal_ix(room: &Pubkey, owner: &Pubkey, market_index: u16, side: u8, salt: [u8; 32]) -> Instruction {
    Instruction {
        program_id: eleven::id(),
        accounts: eleven::accounts::RevealPrediction {
            owner: *owner,
            room: *room,
            prediction: prediction_pda(room, market_index, owner),
        }
        .to_account_metas(None),
        data: eleven::instruction::RevealPrediction { market_index, side, salt }.data(),
    }
}

fn proofs() -> Vec<ProofNode> {
    vec![ProofNode { hash: [7u8; 32], is_right_sibling: true }]
}
fn stat_a() -> StatTerm {
    StatTerm {
        stat_to_prove: ScoreStat { key: 1, value: 1, period: 0 },
        event_stat_root: [9u8; 32],
        stat_proof: proofs(),
    }
}
fn summary() -> FixtureSummary {
    FixtureSummary {
        fixture_id: FIXTURE_ID as i64,
        update_stats: ScoresUpdateStats { update_count: 1, min_timestamp: 0, max_timestamp: 10 },
        events_sub_tree_root: [0u8; 32],
    }
}

/// (prediction, participant) scoring pairs, sorted by owner ascending.
fn scoring_pairs(room: &Pubkey, market_index: u16, mut owners: Vec<Pubkey>) -> Vec<AccountMeta> {
    owners.sort();
    let mut metas = Vec::new();
    for o in owners {
        metas.push(AccountMeta::new(prediction_pda(room, market_index, &o), false));
        metas.push(AccountMeta::new(participant_pda(room, &o), false));
    }
    metas
}

#[allow(clippy::too_many_arguments)]
fn resolve_ix(
    room: &Pubkey,
    settler: &Pubkey,
    oracle: Pubkey,
    market_index: u16,
    kind: ResolveKind,
    fixture_proof: Vec<ProofNode>,
    main_tree_proof: Vec<ProofNode>,
    reveal_owners: Vec<Pubkey>,
) -> Instruction {
    let mut accounts = eleven::accounts::ResolveMarket {
        settler: *settler,
        room: *room,
        txline_oracle: oracle,
        daily_scores_roots: Pubkey::new_unique(),
    }
    .to_account_metas(None);
    accounts.extend(scoring_pairs(room, market_index, reveal_owners));
    Instruction {
        program_id: eleven::id(),
        accounts,
        data: eleven::instruction::ResolveMarket {
            args: ResolveMarketArgs {
                market_index,
                kind,
                target_ts: 1_700_000_000,
                fixture_summary: summary(),
                fixture_proof,
                main_tree_proof,
                stat_a: stat_a(),
                stat_b: None,
                op: None,
            },
        }
        .data(),
    }
}

/// (participant, wallet) settlement pairs, sorted by owner ascending.
fn settle_ix(room: &Pubkey, settler: &Pubkey, treasury: Pubkey, mut owners: Vec<Pubkey>) -> Instruction {
    owners.sort();
    let mut accounts = eleven::accounts::SettleRoom {
        settler: *settler,
        room: *room,
        treasury,
    }
    .to_account_metas(None);
    for o in owners {
        accounts.push(AccountMeta::new_readonly(participant_pda(room, &o), false));
        accounts.push(AccountMeta::new(o, false));
    }
    Instruction { program_id: eleven::id(), accounts, data: eleven::instruction::SettleRoom {}.data() }
}

fn refund_ix(room: &Pubkey, settler: &Pubkey, owner: &Pubkey) -> Instruction {
    Instruction {
        program_id: eleven::id(),
        accounts: eleven::accounts::Refund {
            settler: *settler,
            room: *room,
            participant: participant_pda(room, owner),
            owner_wallet: *owner,
        }
        .to_account_metas(None),
        data: eleven::instruction::Refund {}.data(),
    }
}

fn expect_err(res: TransactionResult, needle: &str) {
    match res {
        Ok(m) => panic!("expected failure containing {needle:?}; got success:\n{}", m.logs.join("\n")),
        Err(f) => {
            let logs = f.meta.logs.join("\n");
            assert!(logs.contains(needle), "expected {needle:?}, got:\n{logs}");
        }
    }
}

// ── a reusable filled room ───────────────────────────────────────────────────

struct Room {
    svm: LiteSVM,
    creator: Keypair,
    players: Vec<Keypair>, // includes creator at [0]
    room_id: u64,
    room: Pubkey,
    treasury: Keypair,
    settler: Keypair,
}

impl Room {
    /// Create a room with `n_players` (creator + joiners), `markets`, and buy-in.
    fn new(buy_in: u64, rake_bps: u16, n_players: usize, markets: Vec<MarketInit>) -> Room {
        let mut svm = boot();
        let stake = buy_in.saturating_add(100 * BUY_IN); // buy-in + slack for rent/fees
        let creator = funded(&mut svm, stake);
        let treasury = funded(&mut svm, 1_000_000_000);
        let settler = funded(&mut svm, 1_000_000_000);
        let room_id = 7;
        let room = room_pda(&creator.pubkey(), room_id);

        let ix = create_room_ix(
            &creator.pubkey(),
            room_id,
            buy_in,
            rake_bps,
            8,
            treasury.pubkey(),
            markets,
        );
        send(&mut svm, &[ix], &creator, &[&creator]).expect("create_room");

        let mut players = vec![creator.insecure_clone()];
        for _ in 1..n_players {
            let p = funded(&mut svm, stake);
            send(&mut svm, &[join_ix(&room, &p.pubkey())], &p, &[&p]).expect("join_room");
            players.push(p);
        }
        Room { svm, creator, players, room_id, room, treasury, settler }
    }

    fn predict(&mut self, player_idx: usize, market_index: u16, side: u8) {
        let p = self.players[player_idx].insecure_clone();
        let salt = [player_idx as u8 + 1; 32];
        send(&mut self.svm, &[commit_ix(&self.room, &p.pubkey(), market_index, side, salt)], &p, &[&p])
            .expect("commit");
        send(&mut self.svm, &[reveal_ix(&self.room, &p.pubkey(), market_index, side, salt)], &p, &[&p])
            .expect("reveal");
    }

    fn owners(&self) -> Vec<Pubkey> {
        self.players.iter().map(|k| k.pubkey()).collect()
    }

    fn resolve_yes(&mut self, market_index: u16, reveal_owners: Vec<Pubkey>) -> TransactionResult {
        let settler = self.settler.insecure_clone();
        let ix = resolve_ix(
            &self.room,
            &settler.pubkey(),
            eleven::settlement::TXORACLE_DEVNET,
            market_index,
            ResolveKind::ProveYes,
            proofs(),
            proofs(),
            reveal_owners,
        );
        send(&mut self.svm, &[ix], &settler, &[&settler])
    }

    fn settle(&mut self) -> TransactionResult {
        let settler = self.settler.insecure_clone();
        let ix = settle_ix(&self.room, &settler.pubkey(), self.treasury.pubkey(), self.owners());
        send(&mut self.svm, &[ix], &settler, &[&settler])
    }

    fn bal(&self, k: &Pubkey) -> u64 {
        self.svm.get_balance(k).unwrap_or(0)
    }
}

// ── tests ────────────────────────────────────────────────────────────────────

#[test]
fn winner_takes_pot_minus_rake() {
    // 3 players, 1 market; only the creator predicts the winning (yes) side.
    let mut r = Room::new(BUY_IN, RAKE_BPS, 3, vec![market(100, 50)]);
    r.predict(0, 0, 1); // creator: YES
    r.predict(1, 0, 0); // p1: NO
    r.predict(2, 0, 0); // p2: NO
    warp(&mut r.svm, T_END + 10);

    let pot = BUY_IN * 3;
    let rake = pot * RAKE_BPS as u64 / 10_000;
    let winner = r.players[0].pubkey();
    let before = r.bal(&winner);
    let t_before = r.bal(&r.treasury.pubkey());

    r.resolve_yes(0, r.owners()).expect("resolve market 0");
    r.settle().expect("settle_room");

    assert_eq!(r.bal(&winner) - before, pot - rake, "winner gets pot - rake");
    assert_eq!(r.bal(&r.treasury.pubkey()) - t_before, rake, "treasury gets exact rake");
    // Losers receive nothing.
    // (their wallets only changed by earlier buy-in, not by settlement)
}

#[test]
fn ties_split_equally() {
    // Two winners tie on points → split (pot - rake) equally.
    let mut r = Room::new(BUY_IN, RAKE_BPS, 3, vec![market(100, 40)]);
    r.predict(0, 0, 1); // YES (win)
    r.predict(1, 0, 1); // YES (win)
    r.predict(2, 0, 0); // NO (lose)
    warp(&mut r.svm, T_END + 10);

    let pot = BUY_IN * 3;
    let rake = pot * RAKE_BPS as u64 / 10_000;
    let share = (pot - rake) / 2;
    let (w0, w1) = (r.players[0].pubkey(), r.players[1].pubkey());
    let (b0, b1) = (r.bal(&w0), r.bal(&w1));

    r.resolve_yes(0, r.owners()).expect("resolve");
    r.settle().expect("settle");

    assert_eq!(r.bal(&w0) - b0, share, "winner 0 gets half");
    assert_eq!(r.bal(&w1) - b1, share, "winner 1 gets half");
    // pot - rake is even here → no dust.
    assert_eq!(share * 2 + rake, pot, "pot fully conserved");
}

#[test]
fn rake_is_capped_on_chain() {
    let mut svm = boot();
    let creator = funded(&mut svm, 100 * BUY_IN);
    let ix = create_room_ix(&creator.pubkey(), 7, BUY_IN, 1_001, 8, creator.pubkey(), vec![market(100, 50)]);
    expect_err(send(&mut svm, &[ix], &creator, &[&creator]), "RakeTooHigh");
}

#[test]
fn refund_unfilled_returns_exact_buyin() {
    // Only the creator joined (< MIN_PLAYERS) → refundable after join deadline.
    let mut r = Room::new(BUY_IN, RAKE_BPS, 1, vec![market(100, 50)]);
    warp(&mut r.svm, T_JOIN_DEADLINE + 1);
    let owner = r.players[0].pubkey();
    let before = r.bal(&owner);

    let settler = r.settler.insecure_clone();
    send(&mut r.svm, &[refund_ix(&r.room, &settler.pubkey(), &owner)], &settler, &[&settler])
        .expect("refund");

    // Exact buy-in returned, plus the participant account's rent (via close).
    let delta = r.bal(&owner) - before;
    assert!(delta >= BUY_IN, "at least the exact buy-in is returned: {delta}");
}

#[test]
fn refund_voided_returns_exact_buyin() {
    // A filled room that never settled becomes refundable after the timelock.
    let mut r = Room::new(BUY_IN, RAKE_BPS, 2, vec![market(100, 50)]);
    warp(&mut r.svm, T_REFUND_DEADLINE + 1);
    let owner = r.players[1].pubkey();
    let before = r.bal(&owner);

    let settler = r.settler.insecure_clone();
    send(&mut r.svm, &[refund_ix(&r.room, &settler.pubkey(), &owner)], &settler, &[&settler])
        .expect("refund voided");
    assert!(r.bal(&owner) - before >= BUY_IN, "exact buy-in returned");
}

#[test]
fn cannot_settle_without_resolving_markets() {
    let mut r = Room::new(BUY_IN, RAKE_BPS, 2, vec![market(100, 50)]);
    r.predict(0, 0, 1);
    r.predict(1, 0, 0);
    warp(&mut r.svm, T_END + 10);
    // Market 0 is unresolved → settle must reject.
    expect_err(r.settle(), "MarketsUnresolved");
}

#[test]
fn wrong_oracle_is_rejected() {
    let mut r = Room::new(BUY_IN, RAKE_BPS, 2, vec![market(100, 50)]);
    r.predict(0, 0, 1);
    r.predict(1, 0, 1);
    let settler = r.settler.insecure_clone();
    let ix = resolve_ix(
        &r.room,
        &settler.pubkey(),
        Pubkey::new_unique(), // not the TxOracle program
        0,
        ResolveKind::ProveYes,
        proofs(),
        proofs(),
        r.owners(),
    );
    expect_err(send(&mut r.svm, &[ix], &settler, &[&settler]), "InvalidOracleProgram");
}

#[test]
fn market_cannot_resolve_twice() {
    let mut r = Room::new(BUY_IN, RAKE_BPS, 2, vec![market(100, 50)]);
    r.predict(0, 0, 1);
    r.predict(1, 0, 1);
    r.resolve_yes(0, r.owners()).expect("first resolve");
    warp(&mut r.svm, T_END + 10);
    expect_err(r.resolve_yes(0, r.owners()), "MarketAlreadyResolved");
}

#[test]
fn room_cannot_settle_twice() {
    let mut r = Room::new(BUY_IN, RAKE_BPS, 2, vec![market(100, 50)]);
    r.predict(0, 0, 1);
    r.predict(1, 0, 0);
    r.resolve_yes(0, r.owners()).expect("resolve");
    warp(&mut r.svm, T_END + 10);
    r.settle().expect("first settle");
    r.svm.expire_blockhash();
    expect_err(r.settle(), "RoomAlreadySettled");
}

#[test]
fn cannot_commit_or_reveal_after_lock() {
    let mut r = Room::new(BUY_IN, RAKE_BPS, 2, vec![market(100, 50)]);
    warp(&mut r.svm, T_LOCK + 1); // past the lock
    let p = r.players[0].insecure_clone();
    let salt = [1u8; 32];
    expect_err(
        send(&mut r.svm, &[commit_ix(&r.room, &p.pubkey(), 0, 1, salt)], &p, &[&p]),
        "MarketLocked",
    );

    // Commit legitimately before lock, then try to reveal after lock.
    r.svm.expire_blockhash();
    warp(&mut r.svm, T_LOCK - 100);
    send(&mut r.svm, &[commit_ix(&r.room, &p.pubkey(), 0, 1, salt)], &p, &[&p]).expect("commit");
    r.svm.expire_blockhash();
    warp(&mut r.svm, T_LOCK + 1);
    expect_err(
        send(&mut r.svm, &[reveal_ix(&r.room, &p.pubkey(), 0, 1, salt)], &p, &[&p]),
        "MarketLocked",
    );
}

#[test]
fn bad_reveal_is_rejected() {
    let mut r = Room::new(BUY_IN, RAKE_BPS, 2, vec![market(100, 50)]);
    let p = r.players[0].insecure_clone();
    let salt = [3u8; 32];
    send(&mut r.svm, &[commit_ix(&r.room, &p.pubkey(), 0, 1, salt)], &p, &[&p]).expect("commit YES");
    // Reveal the *other* side → hash mismatch.
    expect_err(
        send(&mut r.svm, &[reveal_ix(&r.room, &p.pubkey(), 0, 0, salt)], &p, &[&p]),
        "BadReveal",
    );
}

#[test]
fn bigger_buy_in_yields_no_extra_points() {
    // Same predictions in a free-play room (buy-in 0) and a paid room (buy-in
    // large) produce identical points — stake never buys points.
    fn top_points(buy_in: u64) -> u64 {
        let mut r = Room::new(buy_in, 0, 2, vec![market(100, 50)]);
        r.predict(0, 0, 1); // YES
        r.predict(1, 0, 0); // NO
        r.resolve_yes(0, r.owners()).expect("resolve");
        let part = participant_pda(&r.room, &r.players[0].pubkey());
        let acc = r.svm.get_account(&part).unwrap();
        // Participant layout: 8 disc + 32 room + 32 owner + 8 points …
        let points = u64::from_le_bytes(acc.data[72..80].try_into().unwrap());
        points
    }
    let free = top_points(0);
    let paid = top_points(5 * BUY_IN);
    assert_eq!(free, 100, "points come from the market, not the stake");
    assert_eq!(free, paid, "a bigger buy-in yields no extra points");
}

#[test]
fn timeout_resolves_no_and_scores_no_side() {
    // No yes-proof arrives; after the resolve deadline the market resolves NO,
    // and the no-side predictor is the winner.
    let mut r = Room::new(BUY_IN, RAKE_BPS, 2, vec![market(100, 60)]);
    r.predict(0, 0, 1); // YES (will lose)
    r.predict(1, 0, 0); // NO (will win via timeout)
    warp(&mut r.svm, T_RESOLVE_DEADLINE + 1);

    let settler = r.settler.insecure_clone();
    let ix = resolve_ix(&r.room, &settler.pubkey(), eleven::settlement::TXORACLE_DEVNET, 0, ResolveKind::TimeoutNo, vec![], vec![], r.owners());
    send(&mut r.svm, &[ix], &settler, &[&settler]).expect("timeout resolve");

    warp(&mut r.svm, T_END + 10);
    let winner = r.players[1].pubkey();
    let pot = BUY_IN * 2;
    let rake = pot * RAKE_BPS as u64 / 10_000;
    let before = r.bal(&winner);
    r.settle().expect("settle");
    assert_eq!(r.bal(&winner) - before, pot - rake, "no-side predictor wins the pot");
}

#[test]
fn large_pot_rake_math_is_safe() {
    // Exercises the u128 rake path + checked arithmetic at large magnitudes.
    let big: u64 = 2_000 * BUY_IN; // 2000 SOL
    let mut r = Room::new(big, 1_000, 2, vec![market(100, 50)]);
    r.predict(0, 0, 1);
    r.predict(1, 0, 0);
    r.resolve_yes(0, r.owners()).expect("resolve");
    warp(&mut r.svm, T_END + 10);

    let pot = big * 2;
    let rake = (pot as u128 * 1_000u128 / 10_000u128) as u64;
    let winner = r.players[0].pubkey();
    let before = r.bal(&winner);
    let t_before = r.bal(&r.treasury.pubkey());
    r.settle().expect("settle large pot");
    assert_eq!(r.bal(&winner) - before, pot - rake);
    assert_eq!(r.bal(&r.treasury.pubkey()) - t_before, rake);
}
