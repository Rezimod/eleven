//! Deterministic litesvm tests for the ELEVEN settlement engine.
//!
//! `eleven` is loaded at its program id; `mock-txoracle` is loaded at the real
//! devnet TxOracle address, so `settle_pool`'s `validate_stat` CPI resolves. The
//! mock accepts iff a proof was supplied, letting us drive the happy path and
//! every reject path without the live oracle.

use anchor_lang::solana_program::{instruction::Instruction, system_program};
use anchor_lang::{InstructionData, ToAccountMetas};
use anchor_lang::prelude::Pubkey;

use eleven::instructions::create_pool::CreatePoolArgs;
use eleven::settlement::{Comparison, FixtureSummary, Predicate, ProofNode, ScoresUpdateStats};

use litesvm::types::TransactionResult;
use litesvm::LiteSVM;
use solana_keypair::Keypair;
use solana_message::{Message, VersionedMessage};
use solana_signer::Signer;
use solana_transaction::versioned::VersionedTransaction;

const ELEVEN_SO: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/deploy/eleven.so");
const MOCK_SO: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/deploy/mock_txoracle.so");

const STAKE: u64 = 500_000_000; // 0.5 SOL escrow
const THRESHOLD: i64 = 1;
const FIXTURE_ID: u32 = 101;
const STAT_KEY: u16 = 1;

struct Env {
    svm: LiteSVM,
    winner: Keypair,
    settler: Keypair,
    pool: Pubkey,
}

/// Boot litesvm with both programs and a created, escrowed pool.
/// `deadline_reached` picks a past (0) or unreachable (i64::MAX) deadline.
fn setup(deadline_reached: bool) -> Env {
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(eleven::id(), ELEVEN_SO).unwrap();
    svm.add_program_from_file(eleven::settlement::TXORACLE_DEVNET, MOCK_SO)
        .unwrap();

    let creator = Keypair::new();
    let winner = Keypair::new();
    let settler = Keypair::new();
    svm.airdrop(&creator.pubkey(), 10_000_000_000).unwrap();
    svm.airdrop(&settler.pubkey(), 1_000_000_000).unwrap();
    svm.airdrop(&winner.pubkey(), 1_000_000_000).unwrap();

    let (pool, _) = Pubkey::find_program_address(
        &[eleven::POOL_SEED, &FIXTURE_ID.to_le_bytes(), &STAT_KEY.to_le_bytes()],
        &eleven::id(),
    );

    let args = CreatePoolArgs {
        fixture_id: FIXTURE_ID,
        stat_key: STAT_KEY,
        period: 0,
        threshold: THRESHOLD,
        comparison: 0, // GreaterThan
        deadline_ts: if deadline_reached { 0 } else { i64::MAX },
        stake_lamports: STAKE,
        winner: winner.pubkey(),
    };
    let ix = Instruction {
        program_id: eleven::id(),
        accounts: eleven::accounts::CreatePool {
            creator: creator.pubkey(),
            pool,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: eleven::instruction::CreatePool { args }.data(),
    };
    send(&mut svm, &[ix], &creator, &[&creator]).expect("create_pool should succeed");

    Env { svm, winner, settler, pool }
}

fn send(
    svm: &mut LiteSVM,
    ixs: &[Instruction],
    payer: &Keypair,
    signers: &[&Keypair],
) -> TransactionResult {
    let msg = Message::new_with_blockhash(ixs, Some(&payer.pubkey()), &svm.latest_blockhash());
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
    svm.send_transaction(tx)
}

fn proofs() -> Vec<ProofNode> {
    vec![ProofNode { hash: [7u8; 32], is_right_sibling: true }]
}

fn summary() -> FixtureSummary {
    FixtureSummary {
        fixture_id: FIXTURE_ID,
        update_stats: ScoresUpdateStats { update_count: 1, min_timestamp: 0, max_timestamp: 10 },
        event_stats_sub_tree_root: [0u8; 32],
    }
}

/// Build a `settle_pool` ix with tunable oracle / proofs / predicate.
fn settle_ix(
    env: &Env,
    oracle: Pubkey,
    fixture_proof: Vec<ProofNode>,
    main_tree_proof: Vec<ProofNode>,
    predicate: Predicate,
) -> Instruction {
    Instruction {
        program_id: eleven::id(),
        accounts: eleven::accounts::SettlePool {
            pool: env.pool,
            winner: env.winner.pubkey(),
            settler: env.settler.pubkey(),
            txline_oracle: oracle,
            daily_scores_roots: Pubkey::new_unique(),
        }
        .to_account_metas(None),
        data: eleven::instruction::SettlePool {
            target_ts: 1_700_000_000,
            fixture_summary: summary(),
            fixture_proof,
            main_tree_proof,
            predicate,
        }
        .data(),
    }
}

fn good_predicate() -> Predicate {
    Predicate { threshold: THRESHOLD, comparison: Comparison::GreaterThan }
}

fn oracle() -> Pubkey {
    eleven::settlement::TXORACLE_DEVNET
}

fn expect_err_log(res: TransactionResult, needle: &str) {
    match res {
        Ok(m) => panic!("expected failure containing {needle:?}; got success:\n{}", m.logs.join("\n")),
        Err(f) => {
            let logs = f.meta.logs.join("\n");
            assert!(logs.contains(needle), "expected log to contain {needle:?}, got:\n{logs}");
        }
    }
}

#[test]
fn happy_path_verifies_proof_then_releases_escrow() {
    let mut env = setup(true);
    let before = env.svm.get_balance(&env.winner.pubkey()).unwrap();

    let ix = settle_ix(&env, oracle(), proofs(), proofs(), good_predicate());
    let settler = env.settler.insecure_clone();
    let res = send(&mut env.svm, &[ix], &settler, &[&settler]);

    let meta = res.expect("settle_pool should succeed with a valid proof");
    assert!(meta.logs.join("\n").contains("released to winner"));

    let after = env.svm.get_balance(&env.winner.pubkey()).unwrap();
    assert_eq!(after, before + STAKE, "winner should receive the full escrow");
}

#[test]
fn reject_already_settled() {
    let mut env = setup(true);
    let settler = env.settler.insecure_clone();

    let ix1 = settle_ix(&env, oracle(), proofs(), proofs(), good_predicate());
    send(&mut env.svm, &[ix1], &settler, &[&settler]).expect("first settle ok");

    env.svm.expire_blockhash(); // fresh blockhash so the 2nd tx isn't a dup
    let ix2 = settle_ix(&env, oracle(), proofs(), proofs(), good_predicate());
    let res = send(&mut env.svm, &[ix2], &settler, &[&settler]);
    expect_err_log(res, "PoolAlreadySettled");
}

#[test]
fn reject_bad_proof() {
    let mut env = setup(true);
    let settler = env.settler.insecure_clone();
    // Empty proofs → the (mock) oracle's validate_stat rejects → CPI reverts.
    let ix = settle_ix(&env, oracle(), vec![], vec![], good_predicate());
    let res = send(&mut env.svm, &[ix], &settler, &[&settler]);
    expect_err_log(res, "InvalidProof");
}

#[test]
fn reject_wrong_oracle_program() {
    let mut env = setup(true);
    let settler = env.settler.insecure_clone();
    let ix = settle_ix(&env, Pubkey::new_unique(), proofs(), proofs(), good_predicate());
    let res = send(&mut env.svm, &[ix], &settler, &[&settler]);
    expect_err_log(res, "InvalidOracleProgram");
}

#[test]
fn reject_past_deadline() {
    let mut env = setup(false); // deadline unreachable
    let settler = env.settler.insecure_clone();
    let ix = settle_ix(&env, oracle(), proofs(), proofs(), good_predicate());
    let res = send(&mut env.svm, &[ix], &settler, &[&settler]);
    expect_err_log(res, "DeadlineNotReached");
}

#[test]
fn reject_predicate_mismatch() {
    let mut env = setup(true);
    let settler = env.settler.insecure_clone();
    // Threshold differs from what the pool committed to.
    let bad = Predicate { threshold: THRESHOLD + 5, comparison: Comparison::GreaterThan };
    let ix = settle_ix(&env, oracle(), proofs(), proofs(), bad);
    let res = send(&mut env.svm, &[ix], &settler, &[&settler]);
    expect_err_log(res, "PredicateMismatch");
}
