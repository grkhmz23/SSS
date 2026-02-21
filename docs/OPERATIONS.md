# Operations Runbook

## Initialize

```bash
sss-token init --preset sss-1 --name "USD1" --symbol USD1 --treasury <TREASURY_TOKEN_ACCOUNT>
sss-token init --preset sss-2 --name "USD2" --symbol USD2 --treasury <TREASURY_TOKEN_ACCOUNT>
```

## Mint / Burn

```bash
sss-token mint <RECIPIENT_WALLET_OR_TOKEN_ACCOUNT> <AMOUNT_BASE_UNITS>
sss-token burn <AMOUNT_BASE_UNITS>
sss-token burn <FROM_TOKEN_ACCOUNT> <AMOUNT_BASE_UNITS>
```

## Freeze / Thaw / Pause

```bash
sss-token freeze <WALLET_OR_TOKEN_ACCOUNT>
sss-token thaw <WALLET_OR_TOKEN_ACCOUNT>
sss-token pause
sss-token unpause
```

## Compliance (SSS-2)

```bash
sss-token blacklist add <WALLET> --reason "sanctions_match"
sss-token blacklist remove <WALLET>
sss-token seize <WALLET_OR_TOKEN_ACCOUNT> --to <TREASURY_TOKEN_ACCOUNT> --amount <AMOUNT>
```

## Minter management

```bash
sss-token minters list
sss-token minters add <WALLET> --quota <AMOUNT> --window <SECONDS>
sss-token minters remove <WALLET>
```

## Monitoring

```bash
sss-token status
sss-token supply
sss-token holders --min-balance <AMOUNT>
sss-token audit-log --action <ACTION>
```

## Incident response guidelines

1. Pause immediately on anomalous mint/transfer behavior.
2. Freeze identified compromised accounts.
3. For SSS-2, blacklist impacted wallets and seize where legally authorized.
4. Export audit logs from compliance service and preserve signatures.
5. Rotate master/operational roles via `transferAuthority` and `updateRoles`.
