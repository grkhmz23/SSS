import type { Wallet } from '@coral-xyz/anchor';
import type { Signer, Transaction } from '@solana/web3.js';

export function signerWallet(signer: Signer): Wallet {
  return {
    publicKey: signer.publicKey,
    async signTransaction(tx: Transaction): Promise<Transaction> {
      tx.partialSign(signer);
      return tx;
    },
    async signAllTransactions(txs: Transaction[]): Promise<Transaction[]> {
      txs.forEach((tx) => tx.partialSign(signer));
      return txs;
    },
  };
}
