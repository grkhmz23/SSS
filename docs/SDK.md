# SDK (`@stbr/sss-token`)

## Install

```bash
pnpm add @stbr/sss-token
```

## Preset initialization

```ts
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Presets, SolanaStablecoin } from '@stbr/sss-token';

const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
const payer = Keypair.generate();

const sss1 = await SolanaStablecoin.create(connection, {
  payer,
  preset: Presets.SSS_1,
  name: 'USD1',
  symbol: 'USD1',
  uri: 'https://example.org/usd1.json',
  decimals: 6,
  treasury: new PublicKey('<TREASURY_TOKEN_ACCOUNT>'),
  initialMinterQuota: 1_000_000_000n,
  initialMinterWindowSeconds: 86400,
});
```

## Custom configuration

```ts
const custom = await SolanaStablecoin.create(connection, {
  payer,
  name: 'cUSD',
  symbol: 'cUSD',
  uri: 'https://example.org/cusd.json',
  decimals: 6,
  extensions: {
    enableCompliance: true,
    enablePermanentDelegate: true,
    enableTransferHook: true,
    defaultAccountFrozen: false,
    seizeRequiresBlacklist: true,
  },
  roles: {
    treasury: new PublicKey('<TREASURY_TOKEN_ACCOUNT>'),
  },
  initialMinterQuota: 2_000_000_000n,
  initialMinterWindowSeconds: 3600,
});
```

## Core operations

- `mint`, `burn`
- `freeze`, `thaw`
- `pause`, `unpause`
- `updateMinter`, `updateRoles`, `transferAuthority`
- `getSupply`, `getConfig`

## SSS-2 compliance operations

- `compliance.blacklistAdd`
- `compliance.blacklistRemove`
- `compliance.seize`

If compliance is disabled, SDK throws `ComplianceDisabledError`.
