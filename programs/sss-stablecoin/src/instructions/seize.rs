//! Seize instruction for compliance enforcement (SSS-2)

use crate::{
    compliance,
    constants::CONFIG_SEED,
    error::StablecoinError,
    events::Seized,
    state::StablecoinConfig,
};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{transfer_checked, Mint, TokenAccount, Token2022, TransferChecked};

/// Seize tokens from an account to the treasury
pub fn handler(ctx: Context<Seize>, args: SeizeArgs) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(
        config.compliance_enabled,
        StablecoinError::ComplianceDisabled
    );
    require!(
        config.permanent_delegate_enabled,
        StablecoinError::PermanentDelegateDisabled
    );
    require!(
        is_seizer(config, &ctx.accounts.authority.key()),
        StablecoinError::Unauthorized
    );

    // Check blacklist requirement
    if config.seize_requires_blacklist && !args.override_requires_blacklist {
        compliance::validate_blacklisted(
            &ctx.accounts.source_compliance_record,
            &ctx.accounts.source.owner,
            &ctx.accounts.mint.key(),
        )?;
    }

    // Validate token accounts
    require_keys_eq!(
        ctx.accounts.destination.key(),
        config.treasury,
        StablecoinError::InvalidTreasury
    );
    require_keys_eq!(
        ctx.accounts.source.mint,
        ctx.accounts.mint.key(),
        StablecoinError::InvalidTokenAccount
    );
    require_keys_eq!(
        ctx.accounts.destination.mint,
        ctx.accounts.mint.key(),
        StablecoinError::InvalidTokenAccount
    );

    // Transfer tokens using permanent delegate
    let mint_key = ctx.accounts.mint.key();
    let config_seeds: &[&[u8]] = &[CONFIG_SEED, mint_key.as_ref(), &[config.bump]];
    let signer_seeds: &[&[&[u8]]] = &[config_seeds];

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.source.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.destination.to_account_info(),
        authority: ctx.accounts.config.to_account_info(),
    };

    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        ),
        args.amount,
        ctx.accounts.mint.decimals,
    )?;

    emit!(Seized {
        mint: ctx.accounts.mint.key(),
        source: ctx.accounts.source.key(),
        destination: ctx.accounts.destination.key(),
        source_owner: ctx.accounts.source.owner,
        authority: ctx.accounts.authority.key(),
        amount: args.amount,
        override_requires_blacklist: args.override_requires_blacklist,
    });

    Ok(())
}

fn is_seizer(config: &StablecoinConfig, signer: &Pubkey) -> bool {
    *signer == config.master_authority || *signer == config.seizer
}

#[derive(Accounts)]
pub struct Seize<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        has_one = mint @ StablecoinError::InvalidMint
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub source: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub destination: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: source compliance record; validated in instruction.
    pub source_compliance_record: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token2022>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SeizeArgs {
    pub amount: u64,
    pub override_requires_blacklist: bool,
}
