//! SSS Stablecoin - Solana Stablecoin Standard
//!
//! Open-source reference implementation of the Solana Stablecoin Standard
//! with two presets:
//! - SSS-1: issuer-grade stablecoin with mint/burn/freeze/pause and RBAC
//! - SSS-2: adds compliance controls (blacklist, seize via Permanent Delegate,
//!   transfer-hook enforcement)

use anchor_lang::prelude::*;

pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod math;
pub mod state;

mod compliance;

pub use instructions::blacklist;
pub use instructions::burn;
pub use instructions::freeze_thaw;
pub use instructions::initialize;
pub use instructions::mint;
pub use instructions::pause;
pub use instructions::seize;
pub use instructions::transfer_authority;
pub use instructions::update_minter;
pub use instructions::update_roles;
pub use instructions::*;
pub use instructions::blacklist::__client_accounts_add_to_blacklist;
pub use instructions::blacklist::__client_accounts_remove_from_blacklist;
pub use instructions::burn::__client_accounts_burn;
pub use instructions::freeze_thaw::__client_accounts_freeze_account;
pub use instructions::freeze_thaw::__client_accounts_thaw_account;
pub use instructions::initialize::__client_accounts_initialize;
pub use instructions::mint::__client_accounts_mint;
pub use instructions::pause::__client_accounts_pause;
pub use instructions::pause::__client_accounts_unpause;
pub use instructions::seize::__client_accounts_seize;
pub use instructions::transfer_authority::__client_accounts_transfer_authority;
pub use instructions::update_minter::__client_accounts_update_minter;
pub use instructions::update_roles::__client_accounts_update_roles;

declare_id!("Cv2h8n2AeysL1e6VMq9oDdJAqTWdahUAnXQY7n2xjKJb");

#[program]
pub mod sss_stablecoin {
    use super::*;

    // ============ Lifecycle Instructions ============

    /// Initialize a new stablecoin
    pub fn initialize(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
        instructions::initialize::handler(ctx, args)
    }

    /// Mint new tokens to a recipient
    pub fn mint(ctx: Context<Mint>, amount: u64) -> Result<()> {
        instructions::mint::handler(ctx, amount)
    }

    /// Burn tokens from an account
    pub fn burn(ctx: Context<Burn>, amount: u64) -> Result<()> {
        instructions::burn::handler(ctx, amount)
    }

    // ============ Pause Control Instructions ============

    /// Freeze a token account
    pub fn freeze_account(ctx: Context<FreezeAccount>, target: Pubkey) -> Result<()> {
        instructions::freeze_thaw::freeze_handler(ctx, target)
    }

    /// Thaw (unfreeze) a token account
    pub fn thaw_account(ctx: Context<ThawAccount>, target: Pubkey) -> Result<()> {
        instructions::freeze_thaw::thaw_handler(ctx, target)
    }

    /// Pause all operations
    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        instructions::pause::pause_handler(ctx)
    }

    /// Unpause operations
    pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
        instructions::pause::unpause_handler(ctx)
    }

    // ============ Role Management Instructions ============

    /// Update a minter's quota and status
    pub fn update_minter(ctx: Context<UpdateMinter>, args: UpdateMinterArgs) -> Result<()> {
        instructions::update_minter::handler(ctx, args)
    }

    /// Update operational roles
    pub fn update_roles(ctx: Context<UpdateRoles>, args: UpdateRolesArgs) -> Result<()> {
        instructions::update_roles::handler(ctx, args)
    }

    /// Transfer master authority
    pub fn transfer_authority(ctx: Context<TransferAuthority>, new_master: Pubkey) -> Result<()> {
        instructions::transfer_authority::handler(ctx, new_master)
    }

    // ============ SSS-2 Compliance Instructions ============

    /// Add a wallet to the blacklist (SSS-2 only)
    pub fn add_to_blacklist(ctx: Context<AddToBlacklist>, reason: String) -> Result<()> {
        instructions::blacklist::add_handler(ctx, reason)
    }

    /// Remove a wallet from the blacklist (SSS-2 only)
    pub fn remove_from_blacklist(ctx: Context<RemoveFromBlacklist>) -> Result<()> {
        instructions::blacklist::remove_handler(ctx)
    }

    /// Seize tokens from a blacklisted account (SSS-2 only)
    pub fn seize(ctx: Context<Seize>, args: SeizeArgs) -> Result<()> {
        instructions::seize::handler(ctx, args)
    }
}
