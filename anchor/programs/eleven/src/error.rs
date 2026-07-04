use anchor_lang::prelude::*;

#[error_code]
pub enum ElevenError {
    #[msg("Pool has already been settled")]
    PoolAlreadySettled,
    #[msg("Pool deadline has not been reached yet")]
    DeadlineNotReached,
    #[msg("Provided oracle account does not match the TxLINE program id")]
    InvalidOracleProgram,
    #[msg("Provided predicate does not match the pool's committed predicate")]
    PredicateMismatch,
    #[msg("Winner account does not match the pool's recorded winner")]
    WinnerMismatch,
    #[msg("Stake amount must be greater than zero")]
    ZeroStake,
}
