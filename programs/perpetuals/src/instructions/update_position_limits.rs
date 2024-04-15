//! UpdatePosition instruction handler

use {
    crate::{
        error::PerpetualsError,
        state::{custody::Custody, perpetuals::Perpetuals, pool::Pool, position::Position},
    },
    anchor_lang::prelude::*,
};

#[derive(Accounts)]
pub struct UpdatePositionLimits<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [b"perpetuals"],
        bump = perpetuals.perpetuals_bump
    )]
    pub perpetuals: Box<Account<'info, Perpetuals>>,

    #[account(
        mut,
        seeds = [b"pool",
                 pool.name.as_bytes()],
        bump = pool.bump
    )]
    pub pool: Box<Account<'info, Pool>>,

    #[account(
        mut,
        has_one = owner,
        seeds = [b"position",
                 owner.key().as_ref(),
                 pool.key().as_ref(),
                 custody.key().as_ref(),
                 &[position.side as u8]],
        bump = position.bump,
    )]
    pub position: Box<Account<'info, Position>>,

    #[account(
        mut,
        seeds = [b"custody",
                 pool.key().as_ref(),
                 custody.mint.as_ref()],
        bump = custody.bump
    )]
    pub custody: Box<Account<'info, Custody>>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct UpdatePositionLimitsParams {
    pub stop_loss: Option<u64>,
    pub take_profit: Option<u64>,
}

pub fn update_position_limits(
    ctx: Context<UpdatePositionLimits>,
    params: &UpdatePositionLimitsParams,
) -> Result<()> {
    // check permissions
    msg!("Check permissions");
    let perpetuals = ctx.accounts.perpetuals.as_mut();
    let custody = ctx.accounts.custody.as_mut();
    require!(
        perpetuals.permissions.allow_close_position && custody.permissions.allow_close_position,
        PerpetualsError::InstructionNotAllowed
    );

    let position = ctx.accounts.position.as_mut();

    // update position
    position.stop_loss = params.stop_loss;
    position.take_profit = params.take_profit;

    Ok(())
}
