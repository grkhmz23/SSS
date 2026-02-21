import { AnchorProvider, BN, Program } from '@coral-xyz/anchor';
import {
  TOKEN_2022_PROGRAM_ID,
  getAccount,
  getMint,
  type Account as SplTokenAccount,
} from '@solana/spl-token';
import {
  Connection,
  Keypair,
  PublicKey,
  Signer,
  SystemProgram,
  type Commitment,
} from '@solana/web3.js';
import { ComplianceDisabledError } from './errors.js';
import { SSS_STABLECOIN_IDL } from './idl/sssStablecoin.js';
import { SSS_TRANSFER_HOOK_IDL } from './idl/sssTransferHook.js';
import { signerWallet } from './internal/wallet.js';
import { PRESET_DEFINITIONS, Presets } from './presets.js';
import type {
  CreateStablecoinParams,
  RoleConfiguration,
  SeizeInput,
  StablecoinAddresses,
  UpdateMinterInput,
  UpdateRolesInput,
} from './types.js';

export { Presets };
export * from './errors.js';
export * from './types.js';

export const DEFAULT_STABLECOIN_PROGRAM_ID = new PublicKey(
  'Cv2h8n2AeysL1e6VMq9oDdJAqTWdahUAnXQY7n2xjKJb',
);
export const DEFAULT_TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  'BT3pkBpsY47WdNCePzW4ZVi9F7HsEQL7UjiVQevVLJWo',
);

interface SolanaStablecoinConstructor {
  connection: Connection;
  payer: Signer;
  stablecoinProgramId: PublicKey;
  transferHookProgramId: PublicKey;
  addresses: StablecoinAddresses;
  commitment?: Commitment;
}

type ProgramCtor = new (idl: unknown, provider: AnchorProvider) => Program;

function programForId(idl: unknown, programId: PublicKey, provider: AnchorProvider): Program {
  const configuredIdl = {
    ...(idl as Record<string, unknown>),
    address: programId.toBase58(),
  };
  const Ctor = Program as unknown as ProgramCtor;
  return new Ctor(configuredIdl, provider);
}

export interface StablecoinConfigAccount {
  bump: number;
  mint: PublicKey;
  preset: number;
  decimals: number;
  masterAuthority: PublicKey;
  pauser: PublicKey;
  burner: PublicKey;
  blacklister: PublicKey;
  seizer: PublicKey;
  treasury: PublicKey;
  complianceEnabled: boolean;
  paused: boolean;
  seizeRequiresBlacklist: boolean;
  permanentDelegateEnabled: boolean;
  transferHookEnabled: boolean;
  defaultAccountFrozen: boolean;
  transferHookProgram: PublicKey;
}

export class SolanaStablecoin {
  public readonly connection: Connection;
  public readonly payer: Signer;
  public readonly stablecoinProgramId: PublicKey;
  public readonly transferHookProgramId: PublicKey;
  public readonly addresses: StablecoinAddresses;

  private readonly provider: AnchorProvider;
  private readonly stablecoinProgram: Program;
  private readonly transferHookProgram: Program;

  private constructor(input: SolanaStablecoinConstructor) {
    this.connection = input.connection;
    this.payer = input.payer;
    this.stablecoinProgramId = input.stablecoinProgramId;
    this.transferHookProgramId = input.transferHookProgramId;
    this.addresses = input.addresses;

    this.provider = new AnchorProvider(
      this.connection,
      signerWallet(this.payer),
      AnchorProvider.defaultOptions(),
    );
    this.stablecoinProgram = programForId(
      SSS_STABLECOIN_IDL,
      this.stablecoinProgramId,
      this.provider,
    );
    this.transferHookProgram = programForId(
      SSS_TRANSFER_HOOK_IDL,
      this.transferHookProgramId,
      this.provider,
    );
  }

  static deriveConfigPda(
    mint: PublicKey,
    stablecoinProgramId = DEFAULT_STABLECOIN_PROGRAM_ID,
  ): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('config'), mint.toBuffer()],
      stablecoinProgramId,
    )[0];
  }

  static deriveMinterRolePda(
    config: PublicKey,
    minterAuthority: PublicKey,
    stablecoinProgramId = DEFAULT_STABLECOIN_PROGRAM_ID,
  ): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('minter'), config.toBuffer(), minterAuthority.toBuffer()],
      stablecoinProgramId,
    )[0];
  }

  static deriveComplianceRecordPda(
    mint: PublicKey,
    wallet: PublicKey,
    stablecoinProgramId = DEFAULT_STABLECOIN_PROGRAM_ID,
  ): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('compliance'), mint.toBuffer(), wallet.toBuffer()],
      stablecoinProgramId,
    )[0];
  }

  static deriveTransferHookConfigPda(
    mint: PublicKey,
    transferHookProgramId = DEFAULT_TRANSFER_HOOK_PROGRAM_ID,
  ): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('hook-config'), mint.toBuffer()],
      transferHookProgramId,
    )[0];
  }

  static deriveExtraMetaListPda(
    mint: PublicKey,
    transferHookProgramId = DEFAULT_TRANSFER_HOOK_PROGRAM_ID,
  ): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('extra-account-metas'), mint.toBuffer()],
      transferHookProgramId,
    )[0];
  }

  static async create(
    connection: Connection,
    params: CreateStablecoinParams,
  ): Promise<SolanaStablecoin> {
    const payer = params.payer;
    const authority = params.authority ?? payer;
    const stablecoinProgramId = params.stablecoinProgramId ?? DEFAULT_STABLECOIN_PROGRAM_ID;
    const transferHookProgramId = params.transferHookProgramId ?? DEFAULT_TRANSFER_HOOK_PROGRAM_ID;

    const provider = new AnchorProvider(
      connection,
      signerWallet(payer),
      AnchorProvider.defaultOptions(),
    );
    const stablecoinProgram = programForId(SSS_STABLECOIN_IDL, stablecoinProgramId, provider);
    const transferHookProgram = programForId(
      SSS_TRANSFER_HOOK_IDL,
      transferHookProgramId,
      provider,
    );

    const mint = Keypair.generate();
    const config = SolanaStablecoin.deriveConfigPda(mint.publicKey, stablecoinProgramId);
    const masterMinterRole = SolanaStablecoin.deriveMinterRolePda(
      config,
      authority.publicKey,
      stablecoinProgramId,
    );

    const presetFlags =
      'preset' in params
        ? PRESET_DEFINITIONS[params.preset]
        : {
            enableCompliance: params.extensions.enableCompliance,
            enablePermanentDelegate: params.extensions.enablePermanentDelegate,
            enableTransferHook: params.extensions.enableTransferHook,
          };

    const roles: RoleConfiguration =
      'preset' in params
        ? { treasury: params.treasury }
        : {
            pauser: params.roles.pauser,
            burner: params.roles.burner,
            blacklister: params.roles.blacklister,
            seizer: params.roles.seizer,
            treasury: params.roles.treasury,
          };

    const initializeArgs = {
      name: params.name,
      symbol: params.symbol,
      uri: params.uri,
      decimals: params.decimals,
      preset: 'preset' in params && params.preset === Presets.SSS_1 ? { sss1: {} } : { sss2: {} },
      enableCompliance: presetFlags.enableCompliance,
      enablePermanentDelegate: presetFlags.enablePermanentDelegate,
      enableTransferHook: presetFlags.enableTransferHook,
      defaultAccountFrozen: 'preset' in params ? false : params.extensions.defaultAccountFrozen,
      seizeRequiresBlacklist: 'preset' in params ? true : params.extensions.seizeRequiresBlacklist,
      transferHookProgram: transferHookProgramId,
      roles: {
        pauser: roles.pauser ?? null,
        burner: roles.burner ?? null,
        blacklister: roles.blacklister ?? null,
        seizer: roles.seizer ?? null,
        treasury: roles.treasury,
      },
      initialMinterQuota: new BN(params.initialMinterQuota.toString()),
      initialMinterWindowSeconds: new BN(params.initialMinterWindowSeconds),
    };

    const initBuilder = stablecoinProgram.methods.initialize(initializeArgs).accounts({
      payer: payer.publicKey,
      authority: authority.publicKey,
      config,
      masterMinterRole,
      mint: mint.publicKey,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    });

    const initSigners = authority.publicKey.equals(payer.publicKey) ? [mint] : [mint, authority];
    await initBuilder.signers(initSigners).rpc();

    let transferHookConfig: PublicKey | undefined;
    let extraAccountMetaList: PublicKey | undefined;

    if (presetFlags.enableTransferHook) {
      transferHookConfig = SolanaStablecoin.deriveTransferHookConfigPda(
        mint.publicKey,
        transferHookProgramId,
      );
      extraAccountMetaList = SolanaStablecoin.deriveExtraMetaListPda(
        mint.publicKey,
        transferHookProgramId,
      );

      await transferHookProgram.methods
        .initializeHook({
          stablecoinProgram: stablecoinProgramId,
          stablecoinConfig: config,
          treasuryTokenAccount: roles.treasury,
          enforcePause: true,
        })
        .accounts({
          payer: payer.publicKey,
          hookConfig: transferHookConfig,
          mint: mint.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await transferHookProgram.methods
        .initializeExtraAccountMetaList()
        .accounts({
          payer: payer.publicKey,
          hookConfig: transferHookConfig,
          extraAccountMetaList,
          mint: mint.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }

    return new SolanaStablecoin({
      connection,
      payer,
      stablecoinProgramId,
      transferHookProgramId,
      addresses: {
        mint: mint.publicKey,
        config,
        masterMinterRole,
        transferHookConfig,
        extraAccountMetaList,
      },
    });
  }

  static fromExisting(input: {
    connection: Connection;
    payer: Signer;
    mint: PublicKey;
    stablecoinProgramId?: PublicKey;
    transferHookProgramId?: PublicKey;
  }): SolanaStablecoin {
    const stablecoinProgramId = input.stablecoinProgramId ?? DEFAULT_STABLECOIN_PROGRAM_ID;
    const transferHookProgramId = input.transferHookProgramId ?? DEFAULT_TRANSFER_HOOK_PROGRAM_ID;
    const config = SolanaStablecoin.deriveConfigPda(input.mint, stablecoinProgramId);
    const masterMinterRole = SolanaStablecoin.deriveMinterRolePda(
      config,
      input.payer.publicKey,
      stablecoinProgramId,
    );

    return new SolanaStablecoin({
      connection: input.connection,
      payer: input.payer,
      stablecoinProgramId,
      transferHookProgramId,
      addresses: {
        mint: input.mint,
        config,
        masterMinterRole,
        transferHookConfig: SolanaStablecoin.deriveTransferHookConfigPda(
          input.mint,
          transferHookProgramId,
        ),
        extraAccountMetaList: SolanaStablecoin.deriveExtraMetaListPda(
          input.mint,
          transferHookProgramId,
        ),
      },
    });
  }

  async getConfig(): Promise<StablecoinConfigAccount> {
    const accountNamespace = this.stablecoinProgram.account as Record<
      string,
      { fetch: (address: PublicKey) => Promise<unknown> }
    >;
    return accountNamespace.stablecoinConfig.fetch(
      this.addresses.config,
    ) as Promise<StablecoinConfigAccount>;
  }

  async getSupply(): Promise<bigint> {
    const mint = await getMint(
      this.connection,
      this.addresses.mint,
      'confirmed',
      TOKEN_2022_PROGRAM_ID,
    );
    return mint.supply;
  }

  async mint(input: {
    authority: Signer;
    recipientTokenAccount: PublicKey;
    amount: bigint;
  }): Promise<string> {
    const recipientAccount = await this.getTokenAccount(input.recipientTokenAccount);
    const minterRole = SolanaStablecoin.deriveMinterRolePda(
      this.addresses.config,
      input.authority.publicKey,
      this.stablecoinProgramId,
    );
    const recipientCompliance = SolanaStablecoin.deriveComplianceRecordPda(
      this.addresses.mint,
      recipientAccount.owner,
      this.stablecoinProgramId,
    );

    return this.stablecoinProgram.methods
      .mint(new BN(input.amount.toString()))
      .accounts({
        authority: input.authority.publicKey,
        config: this.addresses.config,
        mint: this.addresses.mint,
        recipient: input.recipientTokenAccount,
        minterRole,
        recipientComplianceRecord: recipientCompliance,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers(this.optionalSigner(input.authority))
      .rpc();
  }

  async burn(input: {
    authority: Signer;
    fromTokenAccount: PublicKey;
    amount: bigint;
  }): Promise<string> {
    return this.stablecoinProgram.methods
      .burn(new BN(input.amount.toString()))
      .accounts({
        authority: input.authority.publicKey,
        config: this.addresses.config,
        mint: this.addresses.mint,
        from: input.fromTokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers(this.optionalSigner(input.authority))
      .rpc();
  }

  async freeze(input: { authority: Signer; tokenAccount: PublicKey }): Promise<string> {
    return this.stablecoinProgram.methods
      .freezeAccount(input.tokenAccount)
      .accounts({
        authority: input.authority.publicKey,
        config: this.addresses.config,
        mint: this.addresses.mint,
        tokenAccount: input.tokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers(this.optionalSigner(input.authority))
      .rpc();
  }

  async thaw(input: { authority: Signer; tokenAccount: PublicKey }): Promise<string> {
    return this.stablecoinProgram.methods
      .thawAccount(input.tokenAccount)
      .accounts({
        authority: input.authority.publicKey,
        config: this.addresses.config,
        mint: this.addresses.mint,
        tokenAccount: input.tokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers(this.optionalSigner(input.authority))
      .rpc();
  }

  async pause(authority: Signer): Promise<string> {
    return this.stablecoinProgram.methods
      .pause()
      .accounts({
        authority: authority.publicKey,
        config: this.addresses.config,
        mint: this.addresses.mint,
      })
      .signers(this.optionalSigner(authority))
      .rpc();
  }

  async unpause(authority: Signer): Promise<string> {
    return this.stablecoinProgram.methods
      .unpause()
      .accounts({
        authority: authority.publicKey,
        config: this.addresses.config,
        mint: this.addresses.mint,
      })
      .signers(this.optionalSigner(authority))
      .rpc();
  }

  async updateMinter(authority: Signer, input: UpdateMinterInput): Promise<string> {
    const minterRole = SolanaStablecoin.deriveMinterRolePda(
      this.addresses.config,
      input.minter,
      this.stablecoinProgramId,
    );

    return this.stablecoinProgram.methods
      .updateMinter({
        active: input.active,
        quotaAmount: new BN(input.quotaAmount.toString()),
        windowSeconds: new BN(input.windowSeconds),
        resetWindow: input.resetWindow ?? false,
      })
      .accounts({
        authority: authority.publicKey,
        config: this.addresses.config,
        mint: this.addresses.mint,
        minterAuthority: input.minter,
        minterRole,
        systemProgram: SystemProgram.programId,
      })
      .signers(this.optionalSigner(authority))
      .rpc();
  }

  async updateRoles(authority: Signer, input: UpdateRolesInput): Promise<string> {
    return this.stablecoinProgram.methods
      .updateRoles({
        pauser: input.pauser ?? null,
        burner: input.burner ?? null,
        blacklister: input.blacklister ?? null,
        seizer: input.seizer ?? null,
        treasury: input.treasury ?? null,
      })
      .accounts({
        authority: authority.publicKey,
        config: this.addresses.config,
        mint: this.addresses.mint,
      })
      .signers(this.optionalSigner(authority))
      .rpc();
  }

  async transferAuthority(authority: Signer, newMaster: PublicKey): Promise<string> {
    return this.stablecoinProgram.methods
      .transferAuthority(newMaster)
      .accounts({
        authority: authority.publicKey,
        config: this.addresses.config,
        mint: this.addresses.mint,
      })
      .signers(this.optionalSigner(authority))
      .rpc();
  }

  public readonly compliance = {
    blacklistAdd: async (authority: Signer, wallet: PublicKey, reason: string): Promise<string> => {
      await this.assertComplianceEnabled();
      const complianceRecord = SolanaStablecoin.deriveComplianceRecordPda(
        this.addresses.mint,
        wallet,
        this.stablecoinProgramId,
      );

      return this.stablecoinProgram.methods
        .addToBlacklist(reason)
        .accounts({
          authority: authority.publicKey,
          config: this.addresses.config,
          mint: this.addresses.mint,
          wallet,
          complianceRecord,
          systemProgram: SystemProgram.programId,
        })
        .signers(this.optionalSigner(authority))
        .rpc();
    },

    blacklistRemove: async (authority: Signer, wallet: PublicKey): Promise<string> => {
      await this.assertComplianceEnabled();
      const complianceRecord = SolanaStablecoin.deriveComplianceRecordPda(
        this.addresses.mint,
        wallet,
        this.stablecoinProgramId,
      );

      return this.stablecoinProgram.methods
        .removeFromBlacklist()
        .accounts({
          authority: authority.publicKey,
          config: this.addresses.config,
          mint: this.addresses.mint,
          wallet,
          complianceRecord,
          systemProgram: SystemProgram.programId,
        })
        .signers(this.optionalSigner(authority))
        .rpc();
    },

    seize: async (input: SeizeInput): Promise<string> => {
      await this.assertComplianceEnabled();

      const complianceRecord = SolanaStablecoin.deriveComplianceRecordPda(
        this.addresses.mint,
        input.sourceOwner,
        this.stablecoinProgramId,
      );

      return this.stablecoinProgram.methods
        .seize({
          amount: new BN(input.amount.toString()),
          overrideRequiresBlacklist: input.overrideRequiresBlacklist ?? false,
        })
        .accounts({
          authority: input.authority.publicKey,
          config: this.addresses.config,
          mint: this.addresses.mint,
          source: input.sourceTokenAccount,
          destination: input.destinationTokenAccount,
          sourceComplianceRecord: complianceRecord,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers(this.optionalSigner(input.authority))
        .rpc();
    },
  };

  private optionalSigner(authority: Signer): Signer[] {
    if (authority.publicKey.equals(this.payer.publicKey)) {
      return [];
    }

    return [authority];
  }

  private async getTokenAccount(tokenAccount: PublicKey): Promise<SplTokenAccount> {
    return getAccount(this.connection, tokenAccount, 'confirmed', TOKEN_2022_PROGRAM_ID);
  }

  private async assertComplianceEnabled(): Promise<void> {
    const config = await this.getConfig();
    if (!config.complianceEnabled) {
      throw new ComplianceDisabledError();
    }
  }
}
