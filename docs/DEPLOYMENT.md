# Deployment Guide

## Program IDs

### Devnet

| Program | Program ID | Status |
|---------|-----------|--------|
| sss-stablecoin | `TBD` | ⬜ Pending |
| sss-transfer-hook | `TBD` | ⬜ Pending |

### Mainnet

| Program | Program ID | Status |
|---------|-----------|--------|
| sss-stablecoin | `TBD` | ⬜ Not deployed |
| sss-transfer-hook | `TBD` | ⬜ Not deployed |

---

## Prerequisites

### Tools

- Solana CLI v2.2.1
- Anchor CLI v0.32.1
- Node.js v22+
- pnpm v10+

### Wallet Setup

```bash
# Generate deployment keypair
solana-keygen new -o deploy-keypair.json

# Fund with SOL (Devnet)
solana airdrop 5 <PUBKEY> --url devnet

# Set as default
solana config set --keypair deploy-keypair.json
```

---

## Devnet Deployment

### Step 1: Build Programs

```bash
# Build all programs
anchor build

# Verify build artifacts
ls target/deploy/
# Should see: sss_stablecoin.so, sss_transfer_hook.so
```

### Step 2: Deploy Stablecoin Program

```bash
# Set to Devnet
solana config set --url devnet

# Deploy
anchor deploy -p sss-stablecoin

# Record program ID
# Output: Program Id: <PROGRAM_ID>
```

### Step 3: Deploy Transfer Hook Program

```bash
anchor deploy -p sss-transfer-hook

# Record program ID
```

### Step 4: Update Configuration

Update `Anchor.toml` with deployed program IDs:

```toml
[programs.devnet]
sss_stablecoin = "<YOUR_PROGRAM_ID>"
sss_transfer_hook = "<YOUR_PROGRAM_ID>"
```

### Step 5: Verify Deployment

```bash
# Check program exists
solana program show <PROGRAM_ID> --url devnet

# Run tests against Devnet
anchor test --provider.cluster devnet
```

---

## Example Transactions (Devnet)

### Initialize SSS-1

```typescript
const sss1 = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_1,
  name: 'USD1',
  symbol: 'USD1',
  decimals: 6,
  treasury: treasuryPubkey,
  initialMinterQuota: 1_000_000_000n,
  initialMinterWindowSeconds: 86400,
});

console.log('SSS-1 Mint:', sss1.addresses.mint.toBase58());
```

**Devnet Example**:
- Mint: `TBD`
- Config: `TBD`

### Initialize SSS-2

```typescript
const sss2 = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_2,
  name: 'USD2',
  symbol: 'USD2',
  decimals: 6,
  treasury: treasuryPubkey,
  initialMinterQuota: 1_000_000_000n,
  initialMinterWindowSeconds: 86400,
});

console.log('SSS-2 Mint:', sss2.addresses.mint.toBase58());
```

**Devnet Example**:
- Mint: `TBD`
- Config: `TBD`
- Transfer Hook Config: `TBD`

### Mint Tokens

```typescript
const sig = await sss.mint({
  authority: payer,
  recipientTokenAccount: recipientAta,
  amount: 1000000n,
});

console.log('Mint TX:', sig);
```

**Devnet Example TX**: `TBD`

### Blacklist (SSS-2)

```typescript
const sig = await sss.compliance.blacklistAdd(
  authority,
  walletToBlacklist,
  'OFAC match'
);

console.log('Blacklist TX:', sig);
```

**Devnet Example TX**: `TBD`

### Seize (SSS-2)

```typescript
const sig = await sss.compliance.seize({
  authority,
  sourceTokenAccount: sourceAta,
  destinationTokenAccount: treasuryAta,
  sourceOwner: walletOwner,
  amount: 500000n,
});

console.log('Seize TX:', sig);
```

**Devnet Example TX**: `TBD`

---

## Backend Deployment

### Docker Compose

```bash
cd backend

# Create environment file
cp .env.example .env

# Edit .env with your settings:
# RPC_URL=https://api.devnet.solana.com
# SSS_LOCKFILE_PATH=./sss.lock.json
# SSS_KEYPAIR_PATH=~/.config/solana/id.json

# Build and run
docker compose up -d

# Check health
curl http://localhost:8081/health
curl http://localhost:8082/health
curl http://localhost:8083/health
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `RPC_URL` | Solana RPC endpoint | `http://localhost:8899` |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://postgres:postgres@postgres:5432/sss` |
| `SSS_LOCKFILE_PATH` | Path to sss.lock.json | `/app/sss.lock.json` |
| `SSS_KEYPAIR_PATH` | Path to keypair | `/app/secrets/id.json` |
| `WEBHOOK_URL` | Optional webhook endpoint | - |
| `LOG_LEVEL` | Logging level | `info` |

---

## Mainnet Deployment Considerations

### Pre-Deployment Checklist

- [ ] Third-party security audit completed
- [ ] Bug bounty program established
- [ ] Monitoring infrastructure ready
- [ ] Incident response plan documented
- [ ] Legal review of compliance features (SSS-2)
- [ ] Key custody procedures established

### Key Management

**Recommended**: Use a multi-signature setup for master authority.

```bash
# Create 3-of-5 multisig
# 1. Generate 5 keypairs
# 2. Create multisig with threshold 3
# 3. Set as master authority during initialization
```

### Deployment Steps

1. **Staging**: Deploy to Devnet, run full test suite
2. **Review**: Security audit of deployed programs
3. **Mainnet Deploy**: Deploy programs
4. **Initialize**: Create production stablecoin
5. **Verify**: All operations working as expected
6. **Monitor**: Set up alerts and dashboards

### Cost Estimation

| Action | Cost (SOL) |
|--------|-----------|
| Program deployment (per program) | ~2-5 SOL |
| Initialize stablecoin | ~0.01 SOL |
| Mint operation | ~0.000005 SOL |
| Compliance operation (SSS-2) | ~0.00001 SOL |

---

## Upgrade Strategy

### Immutable Programs

Solana programs are immutable once deployed. To "upgrade":

1. Deploy new program version
2. Initialize new stablecoin with migration plan
3. Coordinate token holder migration
4. Deprecate old program

### Data Migration

If state structure changes:

1. Export state from old program
2. Deploy new program
3. Initialize with exported state
4. Verify state integrity

---

## Troubleshooting

### Deployment fails with "insufficient funds"

```bash
# Check balance
solana balance --url devnet

# Request airdrop
solana airdrop 5 --url devnet
```

### Program too large

```bash
# Check program size
ls -lh target/deploy/*.so

# Optimize build
anchor build --release
```

### Transaction simulation failed

```bash
# Check logs
solana logs --url devnet

# Verify program ID matches
anchor idl init <PROGRAM_ID> --filepath target/idl/sss_stablecoin.json
```

---

## Verification

### Verify Program on SolanaFM

1. Go to [SolanaFM Devnet](https://solana.fm/?cluster=devnet)
2. Search for your program ID
3. Verify:
   - Program data hash matches build
   - Deploy authority is correct
   - Program is executable

### Verify IDL

```bash
# Fetch on-chain IDL
anchor idl fetch <PROGRAM_ID> --url devnet

# Compare with local
anchor idl parse --file target/idl/sss_stablecoin.json
```

---

## Support

For deployment issues:
- Check [Solana Stack Exchange](https://solana.stackexchange.com/)
- Review [Anchor Documentation](https://book.anchor-lang.com/)
- Open an issue on GitHub
