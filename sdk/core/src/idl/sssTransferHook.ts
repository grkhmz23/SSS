import type { Idl } from '@coral-xyz/anchor';

export const SSS_TRANSFER_HOOK_IDL = {
  version: '0.1.0',
  name: 'sss_transfer_hook',
  instructions: [
    {
      name: 'initializeHook',
      accounts: [
        { name: 'payer', isMut: true, isSigner: true },
        { name: 'authority', isMut: false, isSigner: true },
        { name: 'hookConfig', isMut: true, isSigner: false },
        { name: 'stablecoinProgram', isMut: false, isSigner: false },
        { name: 'stablecoinConfig', isMut: false, isSigner: false },
        { name: 'mint', isMut: false, isSigner: false },
        { name: 'systemProgram', isMut: false, isSigner: false },
      ],
      args: [{ name: 'args', type: { defined: 'InitializeHookArgs' } }],
    },
    {
      name: 'updateHookConfig',
      accounts: [
        { name: 'authority', isMut: false, isSigner: true },
        { name: 'hookConfig', isMut: true, isSigner: false },
        { name: 'mint', isMut: false, isSigner: false },
        { name: 'stablecoinConfig', isMut: false, isSigner: false },
      ],
      args: [{ name: 'args', type: { defined: 'UpdateHookConfigArgs' } }],
    },
    {
      name: 'initializeExtraAccountMetaList',
      accounts: [
        { name: 'payer', isMut: true, isSigner: true },
        { name: 'hookConfig', isMut: false, isSigner: false },
        { name: 'extraAccountMetaList', isMut: true, isSigner: false },
        { name: 'mint', isMut: false, isSigner: false },
        { name: 'systemProgram', isMut: false, isSigner: false },
      ],
      args: [],
    },
  ],
  types: [
    {
      name: 'InitializeHookArgs',
      type: {
        kind: 'struct',
        fields: [
          { name: 'stablecoinProgram', type: 'publicKey' },
          { name: 'stablecoinConfig', type: 'publicKey' },
          { name: 'treasuryTokenAccount', type: 'publicKey' },
          { name: 'enforcePause', type: 'bool' },
        ],
      },
    },
    {
      name: 'UpdateHookConfigArgs',
      type: {
        kind: 'struct',
        fields: [
          { name: 'stablecoinConfig', type: { option: 'publicKey' } },
          { name: 'treasuryTokenAccount', type: { option: 'publicKey' } },
          { name: 'enforcePause', type: { option: 'bool' } },
        ],
      },
    },
  ],
} as unknown as Idl;
