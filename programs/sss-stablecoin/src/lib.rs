use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke, system_instruction};
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{
    burn, freeze_account, mint_to, thaw_account, transfer_checked, Burn, Mint, MintTo, TokenAccount,
    TransferChecked,
};
use spl_token_2022::extension::{
    default_account_state::instruction as default_account_state_instruction,
    metadata_pointer::instruction as metadata_pointer_instruction,
    permanent_delegate::instruction as permanent_delegate_instruction,
    token_metadata::instruction as token_metadata_instruction,
    transfer_hook::instruction as transfer_hook_instruction,
    ExtensionType,
};
use spl_token_2022::instruction as token_2022_instruction;
use spl_token_2022::state::AccountState;

mod compliance;

declare_id!("Cv2h8n2AeysL1e6VMq9oDdJAqTWdahUAnXQY7n2xjKJb");

const CONFIG_SEED: &[u8] = b"config";
const MINTER_ROLE_SEED: &[u8] = b"minter";
const COMPLIANCE_RECORD_SEED: &[u8] = b"compliance";

#[program]
pub mod sss_stablecoin {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
        validate_preset(&args)?;

        create_token_2022_mint(&ctx, &args)?;

        let config = &mut ctx.accounts.config;
        config.bump = ctx.bumps.config;
        config.mint = ctx.accounts.mint.key();
        config.preset = args.preset as u8;
        config.decimals = args.decimals;
        config.master_authority = ctx.accounts.authority.key();
        config.pauser = args.roles.pauser.unwrap_or(ctx.accounts.authority.key());
        config.burner = args.roles.burner.unwrap_or(ctx.accounts.authority.key());
        config.blacklister = args.roles.blacklister.unwrap_or(ctx.accounts.authority.key());
        config.seizer = args.roles.seizer.unwrap_or(ctx.accounts.authority.key());
        config.treasury = args.roles.treasury;
        config.compliance_enabled = args.enable_compliance;
        config.paused = false;
        config.seize_requires_blacklist = args.seize_requires_blacklist;
        config.permanent_delegate_enabled = args.enable_permanent_delegate;
        config.transfer_hook_enabled = args.enable_transfer_hook;
        config.default_account_frozen = args.default_account_frozen;
        config.transfer_hook_program = args.transfer_hook_program;

        let minter = &mut ctx.accounts.master_minter_role;
        minter.bump = ctx.bumps.master_minter_role;
        minter.config = config.key();
        minter.authority = ctx.accounts.authority.key();
        minter.active = true;
        minter.quota_amount = args.initial_minter_quota;
        minter.window_seconds = args.initial_minter_window_seconds;
        minter.window_start_ts = Clock::get()?.unix_timestamp;
        minter.minted_in_window = 0;

        emit!(Initialized {
            config: config.key(),
            mint: config.mint,
            master: config.master_authority,
            preset: config.preset,
            compliance_enabled: config.compliance_enabled,
            transfer_hook_enabled: config.transfer_hook_enabled,
            permanent_delegate_enabled: config.permanent_delegate_enabled,
        });

        Ok(())
    }

    pub fn mint(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        let config = &ctx.accounts.config;
        require!(!config.paused, StablecoinError::Paused);
        require_keys_eq!(config.mint, ctx.accounts.mint.key(), StablecoinError::InvalidMint);
        require_keys_eq!(
            ctx.accounts.recipient.mint,
            ctx.accounts.mint.key(),
            StablecoinError::InvalidTokenAccount
        );

        let signer = ctx.accounts.authority.key();
        let minter_role = &mut ctx.accounts.minter_role;
        require!(minter_role.active, StablecoinError::Unauthorized);
        require_keys_eq!(minter_role.authority, signer, StablecoinError::Unauthorized);

        update_quota(minter_role, amount)?;

        if config.compliance_enabled {
            compliance::validate_not_blacklisted(
                &ctx.accounts.recipient_compliance_record,
                &ctx.accounts.recipient.owner,
                &ctx.accounts.mint.key(),
            )?;
        }

        let mint_key = ctx.accounts.mint.key();
        let config_seeds: &[&[u8]] = &[CONFIG_SEED, mint_key.as_ref(), &[config.bump]];
        let signer_seeds: &[&[&[u8]]] = &[config_seeds];

        let cpi_accounts = MintTo {
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.recipient.to_account_info(),
            authority: ctx.accounts.config.to_account_info(),
        };
        mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts,
                signer_seeds,
            ),
            amount,
        )?;

        emit!(Minted {
            mint: ctx.accounts.mint.key(),
            to: ctx.accounts.recipient.key(),
            minter: signer,
            amount,
            quota_used: minter_role.minted_in_window,
            quota_limit: minter_role.quota_amount,
        });

        Ok(())
    }

    pub fn burn(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
        let config = &ctx.accounts.config;
        require!(!config.paused, StablecoinError::Paused);
        require_keys_eq!(
            ctx.accounts.from.mint,
            ctx.accounts.mint.key(),
            StablecoinError::InvalidTokenAccount
        );

        let signer = ctx.accounts.authority.key();
        let account_owner = ctx.accounts.from.owner;

        if signer == account_owner {
            let cpi_accounts = Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.from.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            };
            burn(CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts), amount)?;
        } else {
            require!(is_burner(config, &signer), StablecoinError::Unauthorized);
            require!(
                config.permanent_delegate_enabled,
                StablecoinError::PermanentDelegateDisabled
            );

            let mint_key = ctx.accounts.mint.key();
            let config_seeds: &[&[u8]] = &[CONFIG_SEED, mint_key.as_ref(), &[config.bump]];
            let signer_seeds: &[&[&[u8]]] = &[config_seeds];
            let cpi_accounts = Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.from.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            };
            burn(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    cpi_accounts,
                    signer_seeds,
                ),
                amount,
            )?;
        }

        emit!(Burned {
            mint: ctx.accounts.mint.key(),
            from: ctx.accounts.from.key(),
            authority: signer,
            amount,
        });

        Ok(())
    }

    pub fn freeze_account(ctx: Context<FreezeThaw>, target: Pubkey) -> Result<()> {
        let config = &ctx.accounts.config;
        require!(!config.paused, StablecoinError::Paused);
        require!(is_pauser(config, &ctx.accounts.authority.key()), StablecoinError::Unauthorized);
        require_keys_eq!(
            target,
            ctx.accounts.token_account.key(),
            StablecoinError::InvalidTokenAccount
        );

        let mint_key = ctx.accounts.mint.key();
        let config_seeds: &[&[u8]] = &[CONFIG_SEED, mint_key.as_ref(), &[config.bump]];
        let signer_seeds: &[&[&[u8]]] = &[config_seeds];

        let cpi_accounts = anchor_spl::token_interface::FreezeAccount {
            account: ctx.accounts.token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.config.to_account_info(),
        };
        freeze_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        ))?;

        emit!(AccountFrozen {
            mint: ctx.accounts.mint.key(),
            token_account: target,
            authority: ctx.accounts.authority.key(),
        });

        Ok(())
    }

    pub fn thaw_account(ctx: Context<FreezeThaw>, target: Pubkey) -> Result<()> {
        let config = &ctx.accounts.config;
        require!(is_pauser(config, &ctx.accounts.authority.key()), StablecoinError::Unauthorized);
        require_keys_eq!(
            target,
            ctx.accounts.token_account.key(),
            StablecoinError::InvalidTokenAccount
        );

        let mint_key = ctx.accounts.mint.key();
        let config_seeds: &[&[u8]] = &[CONFIG_SEED, mint_key.as_ref(), &[config.bump]];
        let signer_seeds: &[&[&[u8]]] = &[config_seeds];

        let cpi_accounts = anchor_spl::token_interface::ThawAccount {
            account: ctx.accounts.token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.config.to_account_info(),
        };
        thaw_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        ))?;

        emit!(AccountThawed {
            mint: ctx.accounts.mint.key(),
            token_account: target,
            authority: ctx.accounts.authority.key(),
        });

        Ok(())
    }

    pub fn pause(ctx: Context<AdminAction>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require!(is_pauser(config, &ctx.accounts.authority.key()), StablecoinError::Unauthorized);
        config.paused = true;

        emit!(Paused {
            mint: config.mint,
            authority: ctx.accounts.authority.key(),
        });

        Ok(())
    }

    pub fn unpause(ctx: Context<AdminAction>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require!(is_pauser(config, &ctx.accounts.authority.key()), StablecoinError::Unauthorized);
        config.paused = false;

        emit!(Unpaused {
            mint: config.mint,
            authority: ctx.accounts.authority.key(),
        });

        Ok(())
    }

    pub fn update_minter(ctx: Context<UpdateMinter>, args: UpdateMinterArgs) -> Result<()> {
        let config = &ctx.accounts.config;
        require_master(config, &ctx.accounts.authority.key())?;

        let role = &mut ctx.accounts.minter_role;
        role.bump = ctx.bumps.minter_role;
        role.config = config.key();
        role.authority = ctx.accounts.minter_authority.key();
        role.active = args.active;
        role.quota_amount = args.quota_amount;
        role.window_seconds = args.window_seconds;
        if args.reset_window {
            role.window_start_ts = Clock::get()?.unix_timestamp;
            role.minted_in_window = 0;
        }

        emit!(MinterUpdated {
            mint: config.mint,
            authority: ctx.accounts.authority.key(),
            minter: role.authority,
            active: role.active,
            quota_amount: role.quota_amount,
            window_seconds: role.window_seconds,
        });

        Ok(())
    }

    pub fn update_roles(ctx: Context<UpdateRoles>, args: UpdateRolesArgs) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require_master(config, &ctx.accounts.authority.key())?;

        if let Some(pauser) = args.pauser {
            config.pauser = pauser;
        }
        if let Some(burner) = args.burner {
            config.burner = burner;
        }
        if let Some(blacklister) = args.blacklister {
            config.blacklister = blacklister;
        }
        if let Some(seizer) = args.seizer {
            config.seizer = seizer;
        }
        if let Some(treasury) = args.treasury {
            config.treasury = treasury;
        }

        emit!(RolesUpdated {
            mint: config.mint,
            authority: ctx.accounts.authority.key(),
            pauser: config.pauser,
            burner: config.burner,
            blacklister: config.blacklister,
            seizer: config.seizer,
            treasury: config.treasury,
        });

        Ok(())
    }

    pub fn transfer_authority(ctx: Context<TransferAuthority>, new_master: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require_master(config, &ctx.accounts.authority.key())?;
        let old_master = config.master_authority;
        config.master_authority = new_master;

        emit!(AuthorityTransferred {
            mint: config.mint,
            old_master,
            new_master,
        });

        Ok(())
    }

    pub fn add_to_blacklist(
        ctx: Context<UpsertComplianceRecord>,
        reason: String,
    ) -> Result<()> {
        let config = &ctx.accounts.config;
        require!(config.compliance_enabled, StablecoinError::ComplianceDisabled);
        require!(
            is_blacklister(config, &ctx.accounts.authority.key()),
            StablecoinError::Unauthorized
        );

        let record = &mut ctx.accounts.compliance_record;
        record.bump = ctx.bumps.compliance_record;
        record.mint = ctx.accounts.mint.key();
        record.wallet = ctx.accounts.wallet.key();
        record.blacklisted = true;
        record.reason_hash = compliance::hash_reason(&reason);
        record.updated_at = Clock::get()?.unix_timestamp;

        emit!(BlacklistUpdated {
            mint: record.mint,
            wallet: record.wallet,
            blacklisted: true,
            authority: ctx.accounts.authority.key(),
            reason_hash: record.reason_hash,
        });

        Ok(())
    }

    pub fn remove_from_blacklist(ctx: Context<UpsertComplianceRecord>) -> Result<()> {
        let config = &ctx.accounts.config;
        require!(config.compliance_enabled, StablecoinError::ComplianceDisabled);
        require!(
            is_blacklister(config, &ctx.accounts.authority.key()),
            StablecoinError::Unauthorized
        );

        let record = &mut ctx.accounts.compliance_record;
        record.bump = ctx.bumps.compliance_record;
        record.mint = ctx.accounts.mint.key();
        record.wallet = ctx.accounts.wallet.key();
        record.blacklisted = false;
        record.reason_hash = [0u8; 32];
        record.updated_at = Clock::get()?.unix_timestamp;

        emit!(BlacklistUpdated {
            mint: record.mint,
            wallet: record.wallet,
            blacklisted: false,
            authority: ctx.accounts.authority.key(),
            reason_hash: record.reason_hash,
        });

        Ok(())
    }

    pub fn seize(ctx: Context<Seize>, args: SeizeArgs) -> Result<()> {
        let config = &ctx.accounts.config;
        require!(config.compliance_enabled, StablecoinError::ComplianceDisabled);
        require!(
            config.permanent_delegate_enabled,
            StablecoinError::PermanentDelegateDisabled
        );
        require!(is_seizer(config, &ctx.accounts.authority.key()), StablecoinError::Unauthorized);

        if config.seize_requires_blacklist && !args.override_requires_blacklist {
            compliance::validate_blacklisted(
                &ctx.accounts.source_compliance_record,
                &ctx.accounts.source.owner,
                &ctx.accounts.mint.key(),
            )?;
        }

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
}

fn validate_preset(args: &InitializeArgs) -> Result<()> {
    match args.preset {
        Preset::Sss1 => {
            require!(!args.enable_compliance, StablecoinError::InvalidPresetConfiguration);
            require!(
                !args.enable_permanent_delegate,
                StablecoinError::InvalidPresetConfiguration
            );
            require!(!args.enable_transfer_hook, StablecoinError::InvalidPresetConfiguration);
        }
        Preset::Sss2 => {
            require!(args.enable_compliance, StablecoinError::InvalidPresetConfiguration);
            require!(
                args.enable_permanent_delegate,
                StablecoinError::InvalidPresetConfiguration
            );
            require!(args.enable_transfer_hook, StablecoinError::InvalidPresetConfiguration);
        }
    }

    require!(args.initial_minter_quota > 0, StablecoinError::InvalidQuota);
    require!(args.initial_minter_window_seconds > 0, StablecoinError::InvalidQuota);
    Ok(())
}

fn create_token_2022_mint(ctx: &Context<Initialize>, args: &InitializeArgs) -> Result<()> {
    let mint_key = ctx.accounts.mint.key();
    let config_key = ctx.accounts.config.key();

    let mut extensions = vec![ExtensionType::MetadataPointer];
    if args.enable_permanent_delegate {
        extensions.push(ExtensionType::PermanentDelegate);
    }
    if args.enable_transfer_hook {
        extensions.push(ExtensionType::TransferHook);
    }
    if args.default_account_frozen {
        extensions.push(ExtensionType::DefaultAccountState);
    }

    let mint_len = ExtensionType::try_calculate_account_len::<spl_token_2022::state::Mint>(&extensions)
        .map_err(|_| error!(StablecoinError::MintSizingFailed))?;
    let lamports = Rent::get()?.minimum_balance(mint_len);

    invoke(
        &system_instruction::create_account(
            &ctx.accounts.payer.key(),
            &mint_key,
            lamports,
            mint_len as u64,
            &ctx.accounts.token_program.key(),
        ),
        &[
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    invoke(
        &metadata_pointer_instruction::initialize(
            &ctx.accounts.token_program.key(),
            &mint_key,
            Some(config_key),
            Some(mint_key),
        )?,
        &[ctx.accounts.mint.to_account_info()],
    )?;

    if args.enable_permanent_delegate {
        invoke(
            &permanent_delegate_instruction::initialize(
                &ctx.accounts.token_program.key(),
                &mint_key,
                Some(config_key),
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    if args.enable_transfer_hook {
        invoke(
            &transfer_hook_instruction::initialize(
                &ctx.accounts.token_program.key(),
                &mint_key,
                Some(config_key),
                Some(args.transfer_hook_program),
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    if args.default_account_frozen {
        invoke(
            &default_account_state_instruction::initialize(
                &ctx.accounts.token_program.key(),
                &mint_key,
                &AccountState::Frozen,
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    invoke(
        &token_2022_instruction::initialize_mint2(
            &ctx.accounts.token_program.key(),
            &mint_key,
            &config_key,
            Some(&config_key),
            args.decimals,
        )?,
        &[ctx.accounts.mint.to_account_info()],
    )?;

    invoke(
        &token_metadata_instruction::initialize(
            &ctx.accounts.token_program.key(),
            &mint_key,
            &config_key,
            &mint_key,
            &config_key,
            args.name.clone(),
            args.symbol.clone(),
            args.uri.clone(),
        ),
        &[ctx.accounts.mint.to_account_info()],
    )?;

    Ok(())
}

fn update_quota(minter_role: &mut Account<MinterRole>, amount: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let (window_start_ts, minted_in_window) = compute_quota_update(
        now,
        minter_role.window_start_ts,
        minter_role.window_seconds,
        minter_role.minted_in_window,
        minter_role.quota_amount,
        amount,
    )?;
    minter_role.window_start_ts = window_start_ts;
    minter_role.minted_in_window = minted_in_window;
    Ok(())
}

fn compute_quota_update(
    now: i64,
    window_start_ts: i64,
    window_seconds: i64,
    minted_in_window: u64,
    quota_amount: u64,
    amount: u64,
) -> Result<(i64, u64)> {
    let should_reset = now.saturating_sub(window_start_ts) >= window_seconds;
    let next_window_start = if should_reset { now } else { window_start_ts };
    let next_minted = if should_reset { 0 } else { minted_in_window };
    let updated = next_minted
        .checked_add(amount)
        .ok_or(StablecoinError::MathOverflow)?;
    require!(updated <= quota_amount, StablecoinError::QuotaExceeded);
    Ok((next_window_start, updated))
}

fn require_master(config: &StablecoinConfig, signer: &Pubkey) -> Result<()> {
    require_keys_eq!(config.master_authority, *signer, StablecoinError::Unauthorized);
    Ok(())
}

fn is_pauser(config: &StablecoinConfig, signer: &Pubkey) -> bool {
    *signer == config.master_authority || *signer == config.pauser
}

fn is_burner(config: &StablecoinConfig, signer: &Pubkey) -> bool {
    *signer == config.master_authority || *signer == config.burner
}

fn is_blacklister(config: &StablecoinConfig, signer: &Pubkey) -> bool {
    *signer == config.master_authority || *signer == config.blacklister
}

fn is_seizer(config: &StablecoinConfig, signer: &Pubkey) -> bool {
    *signer == config.master_authority || *signer == config.seizer
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + StablecoinConfig::INIT_SPACE,
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        init,
        payer = payer,
        space = 8 + MinterRole::INIT_SPACE,
        seeds = [MINTER_ROLE_SEED, config.key().as_ref(), authority.key().as_ref()],
        bump
    )]
    pub master_minter_role: Account<'info, MinterRole>,

    /// CHECK: mint keypair signs so the program can create and initialize a Token-2022 mint.
    #[account(mut)]
    pub mint: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MintTokens<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        has_one = mint @ StablecoinError::InvalidMint
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub recipient: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [MINTER_ROLE_SEED, config.key().as_ref(), authority.key().as_ref()],
        bump = minter_role.bump
    )]
    pub minter_role: Account<'info, MinterRole>,

    /// CHECK: validated when compliance mode is enabled.
    pub recipient_compliance_record: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct BurnTokens<'info> {
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
    pub from: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct FreezeThaw<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        has_one = mint @ StablecoinError::InvalidMint
    )]
    pub config: Account<'info, StablecoinConfig>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct AdminAction<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        has_one = mint @ StablecoinError::InvalidMint
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: only used for PDA seed relation.
    pub mint: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct UpdateMinter<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        has_one = mint @ StablecoinError::InvalidMint
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: only used for seed derivation.
    pub mint: UncheckedAccount<'info>,

    /// CHECK: authority key for the target minter.
    pub minter_authority: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + MinterRole::INIT_SPACE,
        seeds = [MINTER_ROLE_SEED, config.key().as_ref(), minter_authority.key().as_ref()],
        bump
    )]
    pub minter_role: Account<'info, MinterRole>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateRoles<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        has_one = mint @ StablecoinError::InvalidMint
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: only used for seed derivation.
    pub mint: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        has_one = mint @ StablecoinError::InvalidMint
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: only used for seed derivation.
    pub mint: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct UpsertComplianceRecord<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        has_one = mint @ StablecoinError::InvalidMint
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: only used for seed derivation.
    pub mint: UncheckedAccount<'info>,

    /// CHECK: wallet under compliance review.
    pub wallet: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + ComplianceRecord::INIT_SPACE,
        seeds = [COMPLIANCE_RECORD_SEED, mint.key().as_ref(), wallet.key().as_ref()],
        bump
    )]
    pub compliance_record: Account<'info, ComplianceRecord>,

    pub system_program: Program<'info, System>,
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
pub struct InitializeArgs {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    pub preset: Preset,
    pub enable_compliance: bool,
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
    pub default_account_frozen: bool,
    pub seize_requires_blacklist: bool,
    pub transfer_hook_program: Pubkey,
    pub roles: RoleConfiguration,
    pub initial_minter_quota: u64,
    pub initial_minter_window_seconds: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateMinterArgs {
    pub active: bool,
    pub quota_amount: u64,
    pub window_seconds: i64,
    pub reset_window: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateRolesArgs {
    pub pauser: Option<Pubkey>,
    pub burner: Option<Pubkey>,
    pub blacklister: Option<Pubkey>,
    pub seizer: Option<Pubkey>,
    pub treasury: Option<Pubkey>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SeizeArgs {
    pub amount: u64,
    pub override_requires_blacklist: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RoleConfiguration {
    pub pauser: Option<Pubkey>,
    pub burner: Option<Pubkey>,
    pub blacklister: Option<Pubkey>,
    pub seizer: Option<Pubkey>,
    pub treasury: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum Preset {
    Sss1 = 1,
    Sss2 = 2,
}

#[account]
#[derive(InitSpace)]
pub struct StablecoinConfig {
    pub bump: u8,
    pub mint: Pubkey,
    pub preset: u8,
    pub decimals: u8,
    pub master_authority: Pubkey,
    pub pauser: Pubkey,
    pub burner: Pubkey,
    pub blacklister: Pubkey,
    pub seizer: Pubkey,
    pub treasury: Pubkey,
    pub compliance_enabled: bool,
    pub paused: bool,
    pub seize_requires_blacklist: bool,
    pub permanent_delegate_enabled: bool,
    pub transfer_hook_enabled: bool,
    pub default_account_frozen: bool,
    pub transfer_hook_program: Pubkey,
}

#[account]
#[derive(InitSpace)]
pub struct MinterRole {
    pub bump: u8,
    pub config: Pubkey,
    pub authority: Pubkey,
    pub active: bool,
    pub quota_amount: u64,
    pub window_seconds: i64,
    pub window_start_ts: i64,
    pub minted_in_window: u64,
}

#[account]
#[derive(InitSpace)]
pub struct ComplianceRecord {
    pub bump: u8,
    pub mint: Pubkey,
    pub wallet: Pubkey,
    pub blacklisted: bool,
    pub reason_hash: [u8; 32],
    pub updated_at: i64,
}

#[event]
pub struct Initialized {
    pub config: Pubkey,
    pub mint: Pubkey,
    pub master: Pubkey,
    pub preset: u8,
    pub compliance_enabled: bool,
    pub transfer_hook_enabled: bool,
    pub permanent_delegate_enabled: bool,
}

#[event]
pub struct Minted {
    pub mint: Pubkey,
    pub to: Pubkey,
    pub minter: Pubkey,
    pub amount: u64,
    pub quota_used: u64,
    pub quota_limit: u64,
}

#[event]
pub struct Burned {
    pub mint: Pubkey,
    pub from: Pubkey,
    pub authority: Pubkey,
    pub amount: u64,
}

#[event]
pub struct AccountFrozen {
    pub mint: Pubkey,
    pub token_account: Pubkey,
    pub authority: Pubkey,
}

#[event]
pub struct AccountThawed {
    pub mint: Pubkey,
    pub token_account: Pubkey,
    pub authority: Pubkey,
}

#[event]
pub struct Paused {
    pub mint: Pubkey,
    pub authority: Pubkey,
}

#[event]
pub struct Unpaused {
    pub mint: Pubkey,
    pub authority: Pubkey,
}

#[event]
pub struct MinterUpdated {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub minter: Pubkey,
    pub active: bool,
    pub quota_amount: u64,
    pub window_seconds: i64,
}

#[event]
pub struct RolesUpdated {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub pauser: Pubkey,
    pub burner: Pubkey,
    pub blacklister: Pubkey,
    pub seizer: Pubkey,
    pub treasury: Pubkey,
}

#[event]
pub struct AuthorityTransferred {
    pub mint: Pubkey,
    pub old_master: Pubkey,
    pub new_master: Pubkey,
}

#[event]
pub struct BlacklistUpdated {
    pub mint: Pubkey,
    pub wallet: Pubkey,
    pub blacklisted: bool,
    pub authority: Pubkey,
    pub reason_hash: [u8; 32],
}

#[event]
pub struct Seized {
    pub mint: Pubkey,
    pub source: Pubkey,
    pub destination: Pubkey,
    pub source_owner: Pubkey,
    pub authority: Pubkey,
    pub amount: u64,
    pub override_requires_blacklist: bool,
}

#[error_code]
pub enum StablecoinError {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Program is paused")]
    Paused,
    #[msg("Mint does not match config")]
    InvalidMint,
    #[msg("Invalid treasury token account")]
    InvalidTreasury,
    #[msg("Quota exceeded for current window")]
    QuotaExceeded,
    #[msg("Invalid quota configuration")]
    InvalidQuota,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Compliance features are disabled")]
    ComplianceDisabled,
    #[msg("Permanent delegate extension is disabled")]
    PermanentDelegateDisabled,
    #[msg("Wallet is blacklisted")]
    WalletBlacklisted,
    #[msg("Wallet is not blacklisted")]
    WalletNotBlacklisted,
    #[msg("Invalid compliance record")]
    InvalidComplianceRecord,
    #[msg("Invalid token account")]
    InvalidTokenAccount,
    #[msg("Mint account sizing failed")]
    MintSizingFailed,
    #[msg("Invalid preset/extension configuration")]
    InvalidPresetConfiguration,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_args(preset: Preset) -> InitializeArgs {
        InitializeArgs {
            name: "USD".to_string(),
            symbol: "USD".to_string(),
            uri: "https://example.org".to_string(),
            decimals: 6,
            preset,
            enable_compliance: preset == Preset::Sss2,
            enable_permanent_delegate: preset == Preset::Sss2,
            enable_transfer_hook: preset == Preset::Sss2,
            default_account_frozen: false,
            seize_requires_blacklist: true,
            transfer_hook_program: Pubkey::default(),
            roles: RoleConfiguration {
                pauser: None,
                burner: None,
                blacklister: None,
                seizer: None,
                treasury: Pubkey::default(),
            },
            initial_minter_quota: 100,
            initial_minter_window_seconds: 60,
        }
    }

    #[test]
    fn preset_validation_accepts_valid_inputs() {
        assert!(validate_preset(&test_args(Preset::Sss1)).is_ok());
        assert!(validate_preset(&test_args(Preset::Sss2)).is_ok());
    }

    #[test]
    fn quota_resets_when_window_elapsed() {
        let result = compute_quota_update(100, 0, 60, 50, 100, 10).unwrap();
        assert_eq!(result.0, 100);
        assert_eq!(result.1, 10);
    }

    #[test]
    fn quota_fails_when_exceeded() {
        let result = compute_quota_update(10, 0, 60, 95, 100, 10);
        assert!(result.is_err());
    }
}
