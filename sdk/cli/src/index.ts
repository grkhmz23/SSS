#!/usr/bin/env node
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { Presets, SolanaStablecoin } from '@stbr/sss-token';
import {
  Connection,
  Keypair,
  ParsedAccountData,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { Command } from 'commander';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import toml from 'toml';

const LOCKFILE_NAME = 'sss.lock.json';

interface Lockfile {
  version: number;
  rpcUrl: string;
  stablecoinProgramId: string;
  transferHookProgramId: string;
  mint: string;
  config: string;
  masterMinterRole: string;
  transferHookConfig?: string;
  extraAccountMetaList?: string;
  createdAt: string;
}

function parsePubkey(value: string, fieldName: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`Invalid ${fieldName}: ${value}`);
  }
}

function resolveKeypairPath(input?: string): string {
  if (input) {
    return input;
  }

  return path.join(os.homedir(), '.config/solana/id.json');
}

function loadKeypair(filePath: string): Keypair {
  const raw = fs.readFileSync(filePath, 'utf8');
  const secret = Uint8Array.from(JSON.parse(raw) as number[]);
  return Keypair.fromSecretKey(secret);
}

function loadLockfile(lockfilePath = path.join(process.cwd(), LOCKFILE_NAME)): Lockfile {
  const raw = fs.readFileSync(lockfilePath, 'utf8');
  return JSON.parse(raw) as Lockfile;
}

function writeLockfile(
  lockfile: Lockfile,
  lockfilePath = path.join(process.cwd(), LOCKFILE_NAME),
): void {
  fs.writeFileSync(lockfilePath, `${JSON.stringify(lockfile, null, 2)}\n`, 'utf8');
}

function parseAmount(amount: string): bigint {
  if (!/^\d+$/.test(amount)) {
    throw new Error(`Amount must be an integer in base units: ${amount}`);
  }
  return BigInt(amount);
}

async function resolveTokenAccountForMint(
  connection: Connection,
  addressOrOwner: PublicKey,
  mint: PublicKey,
): Promise<PublicKey> {
  try {
    const token = await getAccount(connection, addressOrOwner, 'confirmed', TOKEN_2022_PROGRAM_ID);
    if (!token.mint.equals(mint)) {
      throw new Error('Token account mint mismatch');
    }
    return addressOrOwner;
  } catch {
    return getAssociatedTokenAddressSync(
      mint,
      addressOrOwner,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
  }
}

async function resolveOrCreateTokenAccount(
  connection: Connection,
  payer: Keypair,
  addressOrOwner: PublicKey,
  mint: PublicKey,
): Promise<PublicKey> {
  try {
    const token = await getAccount(connection, addressOrOwner, 'confirmed', TOKEN_2022_PROGRAM_ID);
    if (!token.mint.equals(mint)) {
      throw new Error('Token account mint mismatch');
    }
    return addressOrOwner;
  } catch {
    const ata = getAssociatedTokenAddressSync(
      mint,
      addressOrOwner,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    const ix = createAssociatedTokenAccountIdempotentInstruction(
      payer.publicKey,
      ata,
      addressOrOwner,
      mint,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    await sendAndConfirmTransaction(connection, new Transaction().add(ix), [payer]);
    return ata;
  }
}

async function buildClientFromLock(params: {
  rpcUrl: string;
  keypairPath?: string;
  lockfilePath?: string;
}): Promise<{
  client: SolanaStablecoin;
  payer: Keypair;
  lockfile: Lockfile;
  connection: Connection;
}> {
  const lockfile = loadLockfile(params.lockfilePath);
  const payer = loadKeypair(resolveKeypairPath(params.keypairPath));
  const connection = new Connection(params.rpcUrl || lockfile.rpcUrl, 'confirmed');
  const client = SolanaStablecoin.fromExisting({
    connection,
    payer,
    mint: new PublicKey(lockfile.mint),
    stablecoinProgramId: new PublicKey(lockfile.stablecoinProgramId),
    transferHookProgramId: new PublicKey(lockfile.transferHookProgramId),
  });

  return { client, payer, lockfile, connection };
}

function parseCustomConfig(filePath: string): Record<string, unknown> {
  const raw = fs.readFileSync(filePath, 'utf8');
  if (filePath.endsWith('.toml')) {
    return toml.parse(raw) as Record<string, unknown>;
  }

  return JSON.parse(raw) as Record<string, unknown>;
}

const program = new Command();

program
  .name('sss-token')
  .description('Admin CLI for Solana Stablecoin Standard')
  .option('--rpc <url>', 'RPC URL', process.env.SSS_RPC_URL ?? 'http://127.0.0.1:8899')
  .option('--keypair <path>', 'payer keypair path', process.env.SSS_KEYPAIR_PATH)
  .option('--lockfile <path>', 'lockfile path', path.join(process.cwd(), LOCKFILE_NAME));

program
  .command('init')
  .description('Initialize a new SSS stablecoin')
  .option('--preset <preset>', 'sss-1 or sss-2')
  .option('--custom <path>', 'custom config JSON/TOML file')
  .requiredOption('--name <name>', 'token name')
  .requiredOption('--symbol <symbol>', 'token symbol')
  .requiredOption('--treasury <tokenAccount>', 'treasury token account address')
  .option('--uri <uri>', 'metadata URI', 'https://example.org/metadata.json')
  .option('--decimals <decimals>', 'mint decimals', '6')
  .option('--quota <amount>', 'initial minter quota in base units', '1000000000')
  .option('--window <seconds>', 'quota window in seconds', '86400')
  .action(async (options, command) => {
    const root = command.parent?.optsWithGlobals() ?? {};
    const rpcUrl = root.rpc as string;
    const keypairPath = root.keypair as string | undefined;
    const lockfilePath = root.lockfile as string;

    const payer = loadKeypair(resolveKeypairPath(keypairPath));
    const connection = new Connection(rpcUrl, 'confirmed');

    let client: SolanaStablecoin;

    if (options.custom) {
      const parsed = parseCustomConfig(options.custom);
      const extensions = parsed.extensions as {
        enableCompliance: boolean;
        enablePermanentDelegate: boolean;
        enableTransferHook: boolean;
        defaultAccountFrozen: boolean;
        seizeRequiresBlacklist: boolean;
      };
      const roles = parsed.roles as {
        pauser?: string;
        burner?: string;
        blacklister?: string;
        seizer?: string;
      };

      client = await SolanaStablecoin.create(connection, {
        payer,
        name: options.name,
        symbol: options.symbol,
        uri: options.uri,
        decimals: Number(options.decimals),
        extensions,
        roles: {
          pauser: roles.pauser ? parsePubkey(roles.pauser, 'roles.pauser') : undefined,
          burner: roles.burner ? parsePubkey(roles.burner, 'roles.burner') : undefined,
          blacklister: roles.blacklister
            ? parsePubkey(roles.blacklister, 'roles.blacklister')
            : undefined,
          seizer: roles.seizer ? parsePubkey(roles.seizer, 'roles.seizer') : undefined,
          treasury: parsePubkey(options.treasury, 'treasury'),
        },
        initialMinterQuota: parseAmount(String(options.quota)),
        initialMinterWindowSeconds: Number(options.window),
      });
    } else {
      const preset = (options.preset ?? '').toLowerCase();
      if (!['sss-1', 'sss-2'].includes(preset)) {
        throw new Error('`--preset sss-1|sss-2` is required unless --custom is used');
      }

      client = await SolanaStablecoin.create(connection, {
        payer,
        preset: preset === 'sss-1' ? Presets.SSS_1 : Presets.SSS_2,
        name: options.name,
        symbol: options.symbol,
        uri: options.uri,
        decimals: Number(options.decimals),
        treasury: parsePubkey(options.treasury, 'treasury'),
        initialMinterQuota: parseAmount(String(options.quota)),
        initialMinterWindowSeconds: Number(options.window),
      });
    }

    writeLockfile(
      {
        version: 1,
        rpcUrl,
        stablecoinProgramId: client.stablecoinProgramId.toBase58(),
        transferHookProgramId: client.transferHookProgramId.toBase58(),
        mint: client.addresses.mint.toBase58(),
        config: client.addresses.config.toBase58(),
        masterMinterRole: client.addresses.masterMinterRole.toBase58(),
        transferHookConfig: client.addresses.transferHookConfig?.toBase58(),
        extraAccountMetaList: client.addresses.extraAccountMetaList?.toBase58(),
        createdAt: new Date().toISOString(),
      },
      lockfilePath,
    );

    console.log('Initialized stablecoin');
    console.log('mint:', client.addresses.mint.toBase58());
    console.log('config:', client.addresses.config.toBase58());
    console.log('lockfile:', lockfilePath);
  });

program
  .command('mint <recipient> <amount>')
  .description('Mint tokens to a wallet or token account')
  .action(async (recipient, amount, command) => {
    const root = command.parent?.optsWithGlobals() ?? {};
    const { client, payer, connection } = await buildClientFromLock({
      rpcUrl: root.rpc as string,
      keypairPath: root.keypair,
      lockfilePath: root.lockfile,
    });

    const recipientKey = parsePubkey(recipient, 'recipient');
    const recipientTokenAccount = await resolveOrCreateTokenAccount(
      connection,
      payer,
      recipientKey,
      client.addresses.mint,
    );

    const sig = await client.mint({
      authority: payer,
      recipientTokenAccount,
      amount: parseAmount(amount),
    });
    console.log(sig);
  });

program
  .command('burn <amountOrFrom> [maybeAmount]')
  .description(
    'Burn from signer ATA (burn <amount>) or a specific token account (burn <from> <amount>)',
  )
  .action(async (amountOrFrom, maybeAmount, command) => {
    const root = command.parent?.optsWithGlobals() ?? {};
    const { client, payer, connection } = await buildClientFromLock({
      rpcUrl: root.rpc as string,
      keypairPath: root.keypair,
      lockfilePath: root.lockfile,
    });

    let from: PublicKey;
    let amount: bigint;

    if (maybeAmount) {
      from = parsePubkey(amountOrFrom, 'from');
      amount = parseAmount(maybeAmount);
    } else {
      amount = parseAmount(amountOrFrom);
      from = await resolveTokenAccountForMint(connection, payer.publicKey, client.addresses.mint);
    }

    const sig = await client.burn({ authority: payer, fromTokenAccount: from, amount });
    console.log(sig);
  });

program
  .command('freeze <addressOrToken>')
  .description('Freeze a wallet ATA or specific token account')
  .action(async (addressOrToken, command) => {
    const root = command.parent?.optsWithGlobals() ?? {};
    const { client, payer, connection } = await buildClientFromLock({
      rpcUrl: root.rpc as string,
      keypairPath: root.keypair,
      lockfilePath: root.lockfile,
    });

    const target = await resolveTokenAccountForMint(
      connection,
      parsePubkey(addressOrToken, 'addressOrToken'),
      client.addresses.mint,
    );

    const sig = await client.freeze({ authority: payer, tokenAccount: target });
    console.log(sig);
  });

program
  .command('thaw <addressOrToken>')
  .description('Thaw a wallet ATA or specific token account')
  .action(async (addressOrToken, command) => {
    const root = command.parent?.optsWithGlobals() ?? {};
    const { client, payer, connection } = await buildClientFromLock({
      rpcUrl: root.rpc as string,
      keypairPath: root.keypair,
      lockfilePath: root.lockfile,
    });

    const target = await resolveTokenAccountForMint(
      connection,
      parsePubkey(addressOrToken, 'addressOrToken'),
      client.addresses.mint,
    );

    const sig = await client.thaw({ authority: payer, tokenAccount: target });
    console.log(sig);
  });

program
  .command('pause')
  .description('Pause all transfers/mints')
  .action(async (_opts, command) => {
    const root = command.parent?.optsWithGlobals() ?? {};
    const { client, payer } = await buildClientFromLock({
      rpcUrl: root.rpc as string,
      keypairPath: root.keypair,
      lockfilePath: root.lockfile,
    });
    console.log(await client.pause(payer));
  });

program
  .command('unpause')
  .description('Unpause operations')
  .action(async (_opts, command) => {
    const root = command.parent?.optsWithGlobals() ?? {};
    const { client, payer } = await buildClientFromLock({
      rpcUrl: root.rpc as string,
      keypairPath: root.keypair,
      lockfilePath: root.lockfile,
    });
    console.log(await client.unpause(payer));
  });

program
  .command('status')
  .description('Show configuration')
  .action(async (_opts, command) => {
    const root = command.parent?.optsWithGlobals() ?? {};
    const { client, lockfile } = await buildClientFromLock({
      rpcUrl: root.rpc as string,
      keypairPath: root.keypair,
      lockfilePath: root.lockfile,
    });
    const config = await client.getConfig();
    console.log(JSON.stringify({ lockfile, config }, null, 2));
  });

program
  .command('supply')
  .description('Show total supply')
  .action(async (_opts, command) => {
    const root = command.parent?.optsWithGlobals() ?? {};
    const { client } = await buildClientFromLock({
      rpcUrl: root.rpc as string,
      keypairPath: root.keypair,
      lockfilePath: root.lockfile,
    });
    const supply = await client.getSupply();
    console.log(supply.toString());
  });

const blacklist = program.command('blacklist').description('SSS-2 blacklist operations');

blacklist
  .command('add <address>')
  .requiredOption('--reason <text>', 'reason text')
  .action(async (address, options, command) => {
    const root = command.parent?.parent?.optsWithGlobals() ?? {};
    const { client, payer } = await buildClientFromLock({
      rpcUrl: root.rpc as string,
      keypairPath: root.keypair,
      lockfilePath: root.lockfile,
    });

    const sig = await client.compliance.blacklistAdd(
      payer,
      parsePubkey(address, 'address'),
      options.reason,
    );
    console.log(sig);
  });

blacklist.command('remove <address>').action(async (address, _options, command) => {
  const root = command.parent?.parent?.optsWithGlobals() ?? {};
  const { client, payer } = await buildClientFromLock({
    rpcUrl: root.rpc as string,
    keypairPath: root.keypair,
    lockfilePath: root.lockfile,
  });

  const sig = await client.compliance.blacklistRemove(payer, parsePubkey(address, 'address'));
  console.log(sig);
});

program
  .command('seize <addressOrToken>')
  .requiredOption('--to <treasuryTokenAccount>', 'destination treasury token account')
  .requiredOption('--amount <amount>', 'amount in base units')
  .option('--override-blacklist', 'bypass blacklist guard when configuration permits', false)
  .action(async (addressOrToken, options, command) => {
    const root = command.parent?.optsWithGlobals() ?? {};
    const { client, payer, connection } = await buildClientFromLock({
      rpcUrl: root.rpc as string,
      keypairPath: root.keypair,
      lockfilePath: root.lockfile,
    });

    const sourceToken = await resolveTokenAccountForMint(
      connection,
      parsePubkey(addressOrToken, 'addressOrToken'),
      client.addresses.mint,
    );
    const sourceAccount = await getAccount(
      connection,
      sourceToken,
      'confirmed',
      TOKEN_2022_PROGRAM_ID,
    );

    const sig = await client.compliance.seize({
      authority: payer,
      sourceTokenAccount: sourceToken,
      destinationTokenAccount: parsePubkey(options.to, 'to'),
      sourceOwner: sourceAccount.owner,
      amount: parseAmount(options.amount),
      overrideRequiresBlacklist: Boolean(options.overrideBlacklist),
    });

    console.log(sig);
  });

const minters = program.command('minters').description('Minter role management');

minters.command('list').action(async (_options, command) => {
  const root = command.parent?.parent?.optsWithGlobals() ?? {};
  const { lockfile, connection } = await buildClientFromLock({
    rpcUrl: root.rpc as string,
    keypairPath: root.keypair,
    lockfilePath: root.lockfile,
  });

  const programId = new PublicKey(lockfile.stablecoinProgramId);
  const config = new PublicKey(lockfile.config);
  const accounts = await connection.getProgramAccounts(programId, {
    filters: [{ memcmp: { offset: 9, bytes: config.toBase58() } }],
  });

  const decoded = accounts
    .filter((entry) => entry.account.data.length >= 106)
    .map((entry) => {
      const data = entry.account.data;
      const authority = new PublicKey(data.subarray(41, 73));
      const active = data[73] === 1;
      const quotaAmount = data.readBigUInt64LE(74);
      const windowSeconds = Number(data.readBigInt64LE(82));
      const mintedInWindow = data.readBigUInt64LE(98);

      return {
        rolePda: entry.pubkey.toBase58(),
        authority: authority.toBase58(),
        active,
        quotaAmount: quotaAmount.toString(),
        windowSeconds,
        mintedInWindow: mintedInWindow.toString(),
      };
    });

  console.log(JSON.stringify(decoded, null, 2));
});

minters
  .command('add <address>')
  .requiredOption('--quota <amount>', 'quota in base units')
  .requiredOption('--window <seconds>', 'window in seconds')
  .action(async (address, options, command) => {
    const root = command.parent?.parent?.optsWithGlobals() ?? {};
    const { client, payer } = await buildClientFromLock({
      rpcUrl: root.rpc as string,
      keypairPath: root.keypair,
      lockfilePath: root.lockfile,
    });

    const sig = await client.updateMinter(payer, {
      minter: parsePubkey(address, 'address'),
      active: true,
      quotaAmount: parseAmount(options.quota),
      windowSeconds: Number(options.window),
      resetWindow: true,
    });

    console.log(sig);
  });

minters.command('remove <address>').action(async (address, _options, command) => {
  const root = command.parent?.parent?.optsWithGlobals() ?? {};
  const { client, payer } = await buildClientFromLock({
    rpcUrl: root.rpc as string,
    keypairPath: root.keypair,
    lockfilePath: root.lockfile,
  });

  const sig = await client.updateMinter(payer, {
    minter: parsePubkey(address, 'address'),
    active: false,
    quotaAmount: 0n,
    windowSeconds: 1,
    resetWindow: true,
  });

  console.log(sig);
});

program
  .command('holders')
  .description('List holders and balances')
  .option('--min-balance <amount>', 'minimum base units', '0')
  .action(async (options, command) => {
    const root = command.parent?.optsWithGlobals() ?? {};
    const { client, connection } = await buildClientFromLock({
      rpcUrl: root.rpc as string,
      keypairPath: root.keypair,
      lockfilePath: root.lockfile,
    });

    const minBalance = parseAmount(options.minBalance);

    const parsedAccounts = await connection.getParsedProgramAccounts(TOKEN_2022_PROGRAM_ID, {
      filters: [{ memcmp: { offset: 0, bytes: client.addresses.mint.toBase58() } }],
    });

    const holders = parsedAccounts
      .map((entry) => {
        if (!('parsed' in entry.account.data)) {
          return null;
        }

        const parsed = (entry.account.data as ParsedAccountData).parsed?.info as
          | { owner?: string; tokenAmount?: { amount?: string } }
          | undefined;
        if (!parsed?.tokenAmount?.amount) {
          return null;
        }

        const amount = BigInt(parsed.tokenAmount.amount as string);
        if (amount < minBalance) {
          return null;
        }

        return {
          tokenAccount: entry.pubkey.toBase58(),
          owner: parsed.owner as string,
          amount: amount.toString(),
        };
      })
      .filter((entry): entry is { tokenAccount: string; owner: string; amount: string } =>
        Boolean(entry),
      );

    console.log(JSON.stringify(holders, null, 2));
  });

program
  .command('audit-log')
  .description('Read recent program logs')
  .option('--action <type>', 'filter by case-insensitive substring')
  .option('--limit <n>', 'max transactions to inspect', '50')
  .action(async (options, command) => {
    const root = command.parent?.optsWithGlobals() ?? {};
    const { connection, lockfile } = await buildClientFromLock({
      rpcUrl: root.rpc as string,
      keypairPath: root.keypair,
      lockfilePath: root.lockfile,
    });

    const programId = new PublicKey(lockfile.stablecoinProgramId);
    const signatures = await connection.getSignaturesForAddress(programId, {
      limit: Number(options.limit),
    });

    const needle = options.action ? String(options.action).toLowerCase() : null;
    const rows: Array<Record<string, string>> = [];

    for (const item of signatures) {
      const tx = await connection.getTransaction(item.signature, {
        maxSupportedTransactionVersion: 0,
      });
      const logs = tx?.meta?.logMessages ?? [];
      const hit = needle
        ? logs.find((line) => line.toLowerCase().includes(needle))
        : logs.find((line) => line.includes('Program log:'));

      if (!hit) {
        continue;
      }

      rows.push({
        signature: item.signature,
        slot: String(item.slot),
        when: item.blockTime ? new Date(item.blockTime * 1000).toISOString() : 'unknown',
        log: hit,
      });
    }

    console.log(JSON.stringify(rows, null, 2));
  });

program.parseAsync().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
