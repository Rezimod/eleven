use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::instruction::Instruction,
        InstructionData, ToAccountMetas,
    },
    litesvm::LiteSVM,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

/// Smoke test: the program loads and `settle_pool` is wired end-to-end.
/// Settling a pool PDA that was never created must fail (the account is
/// uninitialized), which proves the instruction + account context compile and
/// dispatch correctly.
#[test]
fn settle_pool_rejects_uninitialized_pool() {
    let program_id = eleven::id();
    let payer = Keypair::new();

    let (pool, _bump) = Pubkey::find_program_address(
        &[
            eleven::constants::POOL_SEED,
            &0u32.to_le_bytes(),
            &0u16.to_le_bytes(),
        ],
        &program_id,
    );

    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/eleven.so"));
    svm.add_program(program_id, bytes).unwrap();
    svm.airdrop(&payer.pubkey(), 1_000_000_000).unwrap();

    let ix = Instruction {
        program_id,
        accounts: eleven::accounts::SettlePool {
            pool,
            settler: payer.pubkey(),
            txline_oracle: eleven::constants::TXLINE_ORACLE_PROGRAM_ID,
            daily_scores_roots: Pubkey::new_unique(),
        }
        .to_account_metas(None),
        data: eleven::instruction::SettlePool { target_ts: 0 }.data(),
    };

    let msg = Message::new_with_blockhash(&[ix], Some(&payer.pubkey()), &svm.latest_blockhash());
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&payer]).unwrap();

    let res = svm.send_transaction(tx);
    assert!(
        res.is_err(),
        "settle_pool must fail when the pool account has not been created",
    );
}
