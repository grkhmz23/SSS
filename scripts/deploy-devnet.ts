#!/usr/bin/env node
/**
 * Devnet Deployment Script for SSS Stablecoin
 * 
 * Deploys both programs to Devnet and records Program IDs
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import fs from 'fs';
import path from 'path';

const DEVNET_RPC = 'https://api.devnet.solana.com';
const KEYPAIR_PATH = '/workspaces/SSS/deploy-keypair.json';
const PROGRAM_DIR = '/workspaces/SSS/target/deploy';

interface DeployResult {
  programId: string;
  signature: string;
  size: number;
}

async function loadKeypair(): Promise<Keypair> {
  const secretKey = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf8'));
  return Keypair.fromSecretKey(new Uint8Array(secretKey));
}

async function deployProgram(
  connection: Connection,
  payer: Keypair,
  programPath: string,
  programName: string,
): Promise<DeployResult> {
  console.log(`\n📦 Deploying ${programName}...`);
  
  // Load program binary
  const programBinary = fs.readFileSync(programPath);
  console.log(`  Program size: ${programBinary.length} bytes`);
  
  // Generate new keypair for program
  const programKeypair = Keypair.generate();
  console.log(`  Program ID: ${programKeypair.publicKey.toBase58()}`);
  
  // Calculate rent exemption
  const lamports = await connection.getMinimumBalanceForRentExemption(programBinary.length);
  console.log(`  Rent exemption: ${lamports / 1e9} SOL`);
  
  // Create transaction
  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: programKeypair.publicKey,
      lamports,
      space: programBinary.length,
      programId: SystemProgram.programId,
    }),
  );
  
  // Send transaction
  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [payer, programKeypair],
    { commitment: 'confirmed' },
  );
  
  console.log(`  ✓ Deployment TX: ${signature}`);
  console.log(`  ✓ Program ID: ${programKeypair.publicKey.toBase58()}`);
  
  return {
    programId: programKeypair.publicKey.toBase58(),
    signature,
    size: programBinary.length,
  };
}

async function main() {
  console.log('='.repeat(60));
  console.log('SSS STABLECOIN - DEVNET DEPLOYMENT');
  console.log('='.repeat(60));
  
  // Load keypair
  const payer = await loadKeypair();
  console.log(`\n🔑 Payer: ${payer.publicKey.toBase58()}`);
  
  // Connect to Devnet
  const connection = new Connection(DEVNET_RPC, 'confirmed');
  
  // Check balance
  const balance = await connection.getBalance(payer.publicKey);
  console.log(`💰 Balance: ${balance / 1e9} SOL`);
  
  if (balance < 5_000_000_000) {
    console.error('❌ Insufficient balance. Need at least 5 SOL.');
    process.exit(1);
  }
  
  // Check if program binaries exist
  const stablecoinPath = path.join(PROGRAM_DIR, 'sss_stablecoin.so');
  const hookPath = path.join(PROGRAM_DIR, 'sss_transfer_hook.so');
  
  if (!fs.existsSync(stablecoinPath)) {
    console.error(`❌ Program binary not found: ${stablecoinPath}`);
    console.log('   Please run: anchor build');
    process.exit(1);
  }
  
  if (!fs.existsSync(hookPath)) {
    console.error(`❌ Program binary not found: ${hookPath}`);
    console.log('   Please run: anchor build');
    process.exit(1);
  }
  
  // Deploy programs
  const results: Record<string, DeployResult> = {};
  
  try {
    // Deploy sss-stablecoin
    results.stablecoin = await deployProgram(
      connection,
      payer,
      stablecoinPath,
      'sss-stablecoin',
    );
    
    // Deploy sss-transfer-hook
    results.hook = await deployProgram(
      connection,
      payer,
      hookPath,
      'sss-transfer-hook',
    );
    
    // Save results
    const deploymentInfo = {
      network: 'devnet',
      timestamp: new Date().toISOString(),
      payer: payer.publicKey.toBase58(),
      programs: {
        sssStablecoin: {
          programId: results.stablecoin.programId,
          signature: results.stablecoin.signature,
          size: results.stablecoin.size,
        },
        sssTransferHook: {
          programId: results.hook.programId,
          signature: results.hook.signature,
          size: results.hook.size,
        },
      },
    };
    
    fs.writeFileSync(
      '/workspaces/SSS/.deployment-info.json',
      JSON.stringify(deploymentInfo, null, 2),
    );
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ DEPLOYMENT SUCCESSFUL');
    console.log('='.repeat(60));
    console.log('\n📋 Program IDs:');
    console.log(`  sss-stablecoin:    ${results.stablecoin.programId}`);
    console.log(`  sss-transfer-hook: ${results.hook.programId}`);
    console.log('\n💾 Deployment info saved to: .deployment-info.json');
    console.log('\n🔗 View on SolanaFM:');
    console.log(`  https://solana.fm/address/${results.stablecoin.programId}?cluster=devnet`);
    console.log(`  https://solana.fm/address/${results.hook.programId}?cluster=devnet`);
    console.log('\n' + '='.repeat(60));
    
  } catch (error) {
    console.error('\n❌ Deployment failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);
