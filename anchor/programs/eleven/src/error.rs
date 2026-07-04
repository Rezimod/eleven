use anchor_lang::prelude::*;

#[error_code]
pub enum ElevenError {
    #[msg("Pool has already been settled")]
    PoolAlreadySettled,
    #[msg("Pool deadline has not been reached yet")]
    DeadlineNotReached,
    #[msg("Provided oracle account does not match the TxLINE program id")]
    InvalidOracleProgram,
    #[msg("TxLINE validate_stat proof did not verify the pool outcome")]
    OutcomeNotVerified,
}
