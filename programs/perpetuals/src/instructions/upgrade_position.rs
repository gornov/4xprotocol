//! UpgradePosition instruction handler

use {
    crate::state::{
        multisig::{AdminInstruction, Multisig},
        perpetuals::Perpetuals,
        pool::Pool,
        position::{DeprecatedPosition, Position},
    },
    anchor_lang::prelude::*,
    solana_program::program_memory::sol_memcpy,
    std::{
        cmp,
        io::{self, Write},
    },
};

#[derive(Debug, Default)]
pub struct BpfWriter<T> {
    inner: T,
    pos: u64,
}

impl<T> BpfWriter<T> {
    pub fn new(inner: T) -> Self {
        Self { inner, pos: 0 }
    }
}

impl Write for BpfWriter<&mut [u8]> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        if self.pos >= self.inner.len() as u64 {
            return Ok(0);
        }

        let amt = cmp::min(
            self.inner.len().saturating_sub(self.pos as usize),
            buf.len(),
        );
        sol_memcpy(&mut self.inner[(self.pos as usize)..], buf, amt);
        self.pos += amt as u64;
        Ok(amt)
    }

    fn write_all(&mut self, buf: &[u8]) -> io::Result<()> {
        if self.write(buf)? == buf.len() {
            Ok(())
        } else {
            Err(io::Error::new(
                io::ErrorKind::WriteZero,
                "failed to write whole buffer",
            ))
        }
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct UpgradePosition<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"multisig"],
        bump = multisig.load()?.bump
    )]
    pub multisig: AccountLoader<'info, Multisig>,

    #[account(
        mut,
        seeds = [b"pool",
                 pool.name.as_bytes()],
        bump = pool.bump
    )]
    pub pool: Box<Account<'info, Pool>>,

    #[account(mut)]
    /// CHECK: Deprecated position account
    pub position: AccountInfo<'info>,

    system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpgradePositionParams {}

pub fn upgrade_position<'info>(
    ctx: Context<'_, '_, '_, 'info, UpgradePosition<'info>>,
    params: &UpgradePositionParams,
) -> Result<u8> {
    // validate signatures
    let mut multisig = ctx.accounts.multisig.load_mut()?;

    let signatures_left = multisig.sign_multisig(
        &ctx.accounts.admin,
        &Multisig::get_account_infos(&ctx)[1..],
        &Multisig::get_instruction_data(AdminInstruction::UpgradePosition, params)?,
    )?;
    if signatures_left > 0 {
        msg!(
            "Instruction has been signed but more signatures are required: {}",
            signatures_left
        );
        return Ok(signatures_left);
    }

    // load deprecated position data
    msg!("Load deprecated position");
    let position_account = &ctx.accounts.position;
    if position_account.owner != &crate::ID {
        return Err(ProgramError::IllegalOwner.into());
    }
    if position_account.try_data_len()? != DeprecatedPosition::LEN {
        msg!(
            "InvalidAccountData: {} != {}",
            position_account.try_data_len()?,
            DeprecatedPosition::LEN
        );
        return Err(ProgramError::InvalidAccountData.into());
    }
    let deprecated_position = Account::<DeprecatedPosition>::try_from_unchecked(position_account)?;

    // update position data
    let position_data = Position {
        owner: deprecated_position.owner,
        pool: deprecated_position.pool,
        custody: deprecated_position.custody,
        open_time: deprecated_position.open_time,
        update_time: deprecated_position.update_time,
        side: deprecated_position.side,
        price: deprecated_position.price,
        size_usd: deprecated_position.size_usd,
        collateral_usd: deprecated_position.collateral_usd,
        unrealized_profit_usd: deprecated_position.unrealized_profit_usd,
        unrealized_loss_usd: deprecated_position.unrealized_loss_usd,
        cumulative_interest_snapshot: deprecated_position.cumulative_interest_snapshot,
        locked_amount: deprecated_position.locked_amount,
        collateral_amount: deprecated_position.collateral_amount,
        stop_loss: None,
        take_profit: None,
        bump: deprecated_position.bump,
    };

    msg!("Resize position account");
    Perpetuals::realloc(
        ctx.accounts.admin.to_account_info(),
        ctx.accounts.position.clone(),
        ctx.accounts.system_program.to_account_info(),
        Position::LEN,
        true,
    )?;

    msg!("Re-initialize the position");
    if position_account.try_data_len()? != Position::LEN {
        return Err(ProgramError::InvalidAccountData.into());
    }
    let mut data = position_account.try_borrow_mut_data()?;
    let dst: &mut [u8] = &mut data;
    let mut writer = BpfWriter::new(dst);
    position_data.try_serialize(&mut writer)?;

    Ok(0)
}
