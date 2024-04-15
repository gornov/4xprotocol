use {
    crate::{math, state::perpetuals::Perpetuals},
    anchor_lang::prelude::*,
};

#[derive(Copy, Clone, PartialEq, AnchorSerialize, AnchorDeserialize, Debug)]
pub enum Side {
    None,
    Long,
    Short,
}

impl Default for Side {
    fn default() -> Self {
        Self::None
    }
}

#[derive(Copy, Clone, PartialEq, AnchorSerialize, AnchorDeserialize, Debug)]
pub enum CollateralChange {
    None,
    Add,
    Remove,
}

impl Default for CollateralChange {
    fn default() -> Self {
        Self::None
    }
}

#[account]
#[derive(Default, Debug)]
pub struct DeprecatedPosition {
    pub owner: Pubkey,
    pub pool: Pubkey,
    pub custody: Pubkey,

    pub open_time: i64,
    pub update_time: i64,
    pub side: Side,
    pub price: u64,
    pub size_usd: u64,
    pub collateral_usd: u64,
    pub unrealized_profit_usd: u64,
    pub unrealized_loss_usd: u64,
    pub cumulative_interest_snapshot: u128,
    pub locked_amount: u64,
    pub collateral_amount: u64,

    pub bump: u8,
}

impl DeprecatedPosition {
    pub const LEN: usize = 8 + std::mem::size_of::<DeprecatedPosition>();
}

#[account]
#[derive(Default, Debug)]
pub struct Position {
    pub owner: Pubkey,
    pub pool: Pubkey,
    pub custody: Pubkey,

    pub open_time: i64,
    pub update_time: i64,
    pub side: Side,
    pub price: u64,
    pub size_usd: u64,
    pub collateral_usd: u64,
    pub unrealized_profit_usd: u64,
    pub unrealized_loss_usd: u64,
    pub cumulative_interest_snapshot: u128,
    pub locked_amount: u64,
    pub collateral_amount: u64,

    pub stop_loss: Option<u64>,
    pub take_profit: Option<u64>,

    pub bump: u8,
}

impl Position {
    pub const LEN: usize = 8 + std::mem::size_of::<Position>();

    pub fn get_initial_leverage(&self) -> Result<u64> {
        math::checked_as_u64(math::checked_div(
            math::checked_mul(self.size_usd as u128, Perpetuals::BPS_POWER)?,
            self.collateral_usd as u128,
        )?)
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn test_side() {
        let mut v = Vec::new();
        Side::Long.serialize(&mut v).unwrap();
        assert_eq!(v.as_slice(), &[1u8]);

        let mut v = Vec::new();
        Side::Short.serialize(&mut v).unwrap();
        assert_eq!(v.as_slice(), &[2u8]);
    }
}
