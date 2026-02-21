import type { Idl } from '@coral-xyz/anchor';

export const SSS_STABLECOIN_IDL = {
  version: '0.1.0',
  name: 'sss_stablecoin',
  instructions: [
    {
      name: 'initialize',
      accounts: [
        { name: 'payer', isMut: true, isSigner: true },
        { name: 'authority', isMut: false, isSigner: true },
        { name: 'config', isMut: true, isSigner: false },
        { name: 'masterMinterRole', isMut: true, isSigner: false },
        { name: 'mint', isMut: true, isSigner: true },
        { name: 'tokenProgram', isMut: false, isSigner: false },
        { name: 'systemProgram', isMut: false, isSigner: false },
      ],
      args: [{ name: 'args', type: { defined: 'InitializeArgs' } }],
    },
    {
      name: 'mint',
      accounts: [
        { name: 'authority', isMut: false, isSigner: true },
        { name: 'config', isMut: true, isSigner: false },
        { name: 'mint', isMut: true, isSigner: false },
        { name: 'recipient', isMut: true, isSigner: false },
        { name: 'minterRole', isMut: true, isSigner: false },
        { name: 'recipientComplianceRecord', isMut: false, isSigner: false },
        { name: 'tokenProgram', isMut: false, isSigner: false },
      ],
      args: [{ name: 'amount', type: 'u64' }],
    },
    {
      name: 'burn',
      accounts: [
        { name: 'authority', isMut: false, isSigner: true },
        { name: 'config', isMut: false, isSigner: false },
        { name: 'mint', isMut: true, isSigner: false },
        { name: 'from', isMut: true, isSigner: false },
        { name: 'tokenProgram', isMut: false, isSigner: false },
      ],
      args: [{ name: 'amount', type: 'u64' }],
    },
    {
      name: 'freezeAccount',
      accounts: [
        { name: 'authority', isMut: false, isSigner: true },
        { name: 'config', isMut: false, isSigner: false },
        { name: 'mint', isMut: false, isSigner: false },
        { name: 'tokenAccount', isMut: true, isSigner: false },
        { name: 'tokenProgram', isMut: false, isSigner: false },
      ],
      args: [{ name: 'target', type: 'publicKey' }],
    },
    {
      name: 'thawAccount',
      accounts: [
        { name: 'authority', isMut: false, isSigner: true },
        { name: 'config', isMut: false, isSigner: false },
        { name: 'mint', isMut: false, isSigner: false },
        { name: 'tokenAccount', isMut: true, isSigner: false },
        { name: 'tokenProgram', isMut: false, isSigner: false },
      ],
      args: [{ name: 'target', type: 'publicKey' }],
    },
    {
      name: 'pause',
      accounts: [
        { name: 'authority', isMut: false, isSigner: true },
        { name: 'config', isMut: true, isSigner: false },
        { name: 'mint', isMut: false, isSigner: false },
      ],
      args: [],
    },
    {
      name: 'unpause',
      accounts: [
        { name: 'authority', isMut: false, isSigner: true },
        { name: 'config', isMut: true, isSigner: false },
        { name: 'mint', isMut: false, isSigner: false },
      ],
      args: [],
    },
    {
      name: 'updateMinter',
      accounts: [
        { name: 'authority', isMut: true, isSigner: true },
        { name: 'config', isMut: false, isSigner: false },
        { name: 'mint', isMut: false, isSigner: false },
        { name: 'minterAuthority', isMut: false, isSigner: false },
        { name: 'minterRole', isMut: true, isSigner: false },
        { name: 'systemProgram', isMut: false, isSigner: false },
      ],
      args: [{ name: 'args', type: { defined: 'UpdateMinterArgs' } }],
    },
    {
      name: 'updateRoles',
      accounts: [
        { name: 'authority', isMut: false, isSigner: true },
        { name: 'config', isMut: true, isSigner: false },
        { name: 'mint', isMut: false, isSigner: false },
      ],
      args: [{ name: 'args', type: { defined: 'UpdateRolesArgs' } }],
    },
    {
      name: 'transferAuthority',
      accounts: [
        { name: 'authority', isMut: false, isSigner: true },
        { name: 'config', isMut: true, isSigner: false },
        { name: 'mint', isMut: false, isSigner: false },
      ],
      args: [{ name: 'newMaster', type: 'publicKey' }],
    },
    {
      name: 'addToBlacklist',
      accounts: [
        { name: 'authority', isMut: true, isSigner: true },
        { name: 'config', isMut: false, isSigner: false },
        { name: 'mint', isMut: false, isSigner: false },
        { name: 'wallet', isMut: false, isSigner: false },
        { name: 'complianceRecord', isMut: true, isSigner: false },
        { name: 'systemProgram', isMut: false, isSigner: false },
      ],
      args: [{ name: 'reason', type: 'string' }],
    },
    {
      name: 'removeFromBlacklist',
      accounts: [
        { name: 'authority', isMut: true, isSigner: true },
        { name: 'config', isMut: false, isSigner: false },
        { name: 'mint', isMut: false, isSigner: false },
        { name: 'wallet', isMut: false, isSigner: false },
        { name: 'complianceRecord', isMut: true, isSigner: false },
        { name: 'systemProgram', isMut: false, isSigner: false },
      ],
      args: [],
    },
    {
      name: 'seize',
      accounts: [
        { name: 'authority', isMut: false, isSigner: true },
        { name: 'config', isMut: false, isSigner: false },
        { name: 'mint', isMut: true, isSigner: false },
        { name: 'source', isMut: true, isSigner: false },
        { name: 'destination', isMut: true, isSigner: false },
        { name: 'sourceComplianceRecord', isMut: false, isSigner: false },
        { name: 'tokenProgram', isMut: false, isSigner: false },
      ],
      args: [{ name: 'args', type: { defined: 'SeizeArgs' } }],
    },
  ],
  accounts: [
    {
      name: 'stablecoinConfig',
      type: {
        kind: 'struct',
        fields: [
          { name: 'bump', type: 'u8' },
          { name: 'mint', type: 'publicKey' },
          { name: 'preset', type: 'u8' },
          { name: 'decimals', type: 'u8' },
          { name: 'masterAuthority', type: 'publicKey' },
          { name: 'pauser', type: 'publicKey' },
          { name: 'burner', type: 'publicKey' },
          { name: 'blacklister', type: 'publicKey' },
          { name: 'seizer', type: 'publicKey' },
          { name: 'treasury', type: 'publicKey' },
          { name: 'complianceEnabled', type: 'bool' },
          { name: 'paused', type: 'bool' },
          { name: 'seizeRequiresBlacklist', type: 'bool' },
          { name: 'permanentDelegateEnabled', type: 'bool' },
          { name: 'transferHookEnabled', type: 'bool' },
          { name: 'defaultAccountFrozen', type: 'bool' },
          { name: 'transferHookProgram', type: 'publicKey' },
        ],
      },
    },
    {
      name: 'minterRole',
      type: {
        kind: 'struct',
        fields: [
          { name: 'bump', type: 'u8' },
          { name: 'config', type: 'publicKey' },
          { name: 'authority', type: 'publicKey' },
          { name: 'active', type: 'bool' },
          { name: 'quotaAmount', type: 'u64' },
          { name: 'windowSeconds', type: 'i64' },
          { name: 'windowStartTs', type: 'i64' },
          { name: 'mintedInWindow', type: 'u64' },
        ],
      },
    },
    {
      name: 'complianceRecord',
      type: {
        kind: 'struct',
        fields: [
          { name: 'bump', type: 'u8' },
          { name: 'mint', type: 'publicKey' },
          { name: 'wallet', type: 'publicKey' },
          { name: 'blacklisted', type: 'bool' },
          { name: 'reasonHash', type: { array: ['u8', 32] } },
          { name: 'updatedAt', type: 'i64' },
        ],
      },
    },
  ],
  types: [
    {
      name: 'InitializeArgs',
      type: {
        kind: 'struct',
        fields: [
          { name: 'name', type: 'string' },
          { name: 'symbol', type: 'string' },
          { name: 'uri', type: 'string' },
          { name: 'decimals', type: 'u8' },
          { name: 'preset', type: { defined: 'Preset' } },
          { name: 'enableCompliance', type: 'bool' },
          { name: 'enablePermanentDelegate', type: 'bool' },
          { name: 'enableTransferHook', type: 'bool' },
          { name: 'defaultAccountFrozen', type: 'bool' },
          { name: 'seizeRequiresBlacklist', type: 'bool' },
          { name: 'transferHookProgram', type: 'publicKey' },
          { name: 'roles', type: { defined: 'RoleConfiguration' } },
          { name: 'initialMinterQuota', type: 'u64' },
          { name: 'initialMinterWindowSeconds', type: 'i64' },
        ],
      },
    },
    {
      name: 'UpdateMinterArgs',
      type: {
        kind: 'struct',
        fields: [
          { name: 'active', type: 'bool' },
          { name: 'quotaAmount', type: 'u64' },
          { name: 'windowSeconds', type: 'i64' },
          { name: 'resetWindow', type: 'bool' },
        ],
      },
    },
    {
      name: 'UpdateRolesArgs',
      type: {
        kind: 'struct',
        fields: [
          { name: 'pauser', type: { option: 'publicKey' } },
          { name: 'burner', type: { option: 'publicKey' } },
          { name: 'blacklister', type: { option: 'publicKey' } },
          { name: 'seizer', type: { option: 'publicKey' } },
          { name: 'treasury', type: { option: 'publicKey' } },
        ],
      },
    },
    {
      name: 'SeizeArgs',
      type: {
        kind: 'struct',
        fields: [
          { name: 'amount', type: 'u64' },
          { name: 'overrideRequiresBlacklist', type: 'bool' },
        ],
      },
    },
    {
      name: 'RoleConfiguration',
      type: {
        kind: 'struct',
        fields: [
          { name: 'pauser', type: { option: 'publicKey' } },
          { name: 'burner', type: { option: 'publicKey' } },
          { name: 'blacklister', type: { option: 'publicKey' } },
          { name: 'seizer', type: { option: 'publicKey' } },
          { name: 'treasury', type: 'publicKey' },
        ],
      },
    },
    {
      name: 'Preset',
      type: {
        kind: 'enum',
        variants: [{ name: 'Sss1' }, { name: 'Sss2' }],
      },
    },
  ],
} as unknown as Idl;
