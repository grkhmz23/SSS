# Architecture

## Layer model

1. **On-chain control plane** (`programs/sss-stablecoin`): RBAC, quotas, compliance records, mint/freeze/pause/seize.
2. **On-chain transfer enforcement** (`programs/sss-transfer-hook`): transfer-time blacklist and pause checks.
3. **SDK/CLI** (`sdk/core`, `sdk/cli`): issuer/admin operations and lockfile-driven workflows.
4. **Backend services** (`backend/`): automated mint/burn, indexing, webhook and compliance APIs.

## Data model

- `StablecoinConfig` PDA: global config + role addresses + feature flags.
- `MinterRole` PDA (seeded by config + authority): quota and window tracking.
- `ComplianceRecord` PDA (seeded by mint + wallet): O(1) blacklist status.
- Transfer-hook `ExtraAccountMetaList` PDA per mint.

## Key data flows

1. `initialize`: config + mint creation with Token-2022 extensions.
2. `mint`: role check -> quota update -> compliance check (if enabled) -> mint CPI.
3. `transfer`: token-2022 invokes transfer-hook -> pause/blacklist validation.
4. `seize`: seizer role + compliance condition -> permanent delegate transfer to treasury.
5. `indexer`: signatures/logs -> postgres events -> webhook retries.

## Security model

- No single super-key: master + explicit operational roles.
- Strong feature gating: SSS-2 instructions fail cleanly when compliance disabled.
- Deterministic PDA addressing for auditability and O(1) lookup.
- Structured events emitted for all sensitive operations.
