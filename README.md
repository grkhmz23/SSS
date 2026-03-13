# Solana Stablecoin Standard (SSS)

Open-source reference implementation of the **Solana Stablecoin Standard** with two presets:

- **SSS-1**: issuer-grade stablecoin with mint/burn/freeze/pause and RBAC.
- **SSS-2**: adds compliance controls (blacklist, seize via Permanent Delegate, transfer-hook enforcement).

## Repository Layout

```text
SSS/
├── programs/
│   ├── sss-stablecoin/      # Anchor program for SSS-1 + SSS-2
│   └── sss-transfer-hook/   # Anchor transfer hook enforcement program
├── sdk/
│   ├── core/                # @stbr/sss-token TypeScript SDK
│   └── cli/                 # sss-token admin CLI
├── backend/
│   ├── mint-burn/           # REST execution service
│   ├── indexer/             # event indexer + webhook dispatcher
│   ├── compliance/          # compliance API service
│   └── docker-compose.yml
├── tests/                   # Anchor TS integration tests
├── trident-tests/           # fuzz/smoke harness
├── docs/                    # architecture/spec/runbook/API docs
└── .github/workflows/ci.yml
```

## Preset Comparison

| Capability                     | SSS-1 | SSS-2 |
| ------------------------------ | ----: | ----: |
| Mint/Burn/Freeze/Thaw/Pause    |   Yes |   Yes |
| Role-based authorities         |   Yes |   Yes |
| Per-minter time-window quotas  |   Yes |   Yes |
| Transfer Hook blacklist checks |    No |   Yes |
| Compliance records PDA lookup  |    No |   Yes |
| Seize via Permanent Delegate   |    No |   Yes |

## Architecture

```mermaid
flowchart TD
  Admin[Admin/Issuer] --> CLI[sss-token CLI]
  Admin --> SDK[@stbr/sss-token SDK]
  CLI --> Stablecoin[sss-stablecoin program]
  SDK --> Stablecoin
  Token2022[Token-2022 Program] --> Hook[sss-transfer-hook program]
  Hook --> Stablecoin
  Backend[backend services] --> SDK
  Backend --> Postgres[(Postgres)]
  Backend --> Webhooks[Webhook targets]
```

## Local Development (macOS)

### Required tools

- Rust toolchain (`rustup`, `cargo`, `rustc`)
- Solana CLI
- Anchor CLI (`anchor-cli` v0.32.1)
- Node.js 22+
- pnpm 10+
- Docker Desktop

### Install commands (Apple Silicon/macOS)

```bash
# Homebrew (if missing)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Node + pnpm
brew install node
npm install -g pnpm@10

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# Solana CLI (Anza)
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
solana-install init 2.2.1

# Anchor CLI
cargo install --git https://github.com/coral-xyz/anchor --tag v0.32.1 anchor-cli --force

# Docker Desktop
brew install --cask docker
```

### Bootstrap

```bash
pnpm install
anchor build
```

### Run checks

```bash
cargo fmt --check
cargo clippy -p sss-stablecoin -p sss-transfer-hook --all-targets -- -D warnings
anchor test
pnpm -r lint
pnpm -r test
cd backend && docker compose build
```

## CLI quick start

```bash
# SSS-1
pnpm --filter @stbr/sss-token-cli build
sss-token init --preset sss-1 --name "USD1" --symbol USD1 --treasury <TREASURY_TOKEN_ACCOUNT>

# SSS-2
sss-token init --preset sss-2 --name "USD2" --symbol USD2 --treasury <TREASURY_TOKEN_ACCOUNT>
```

See `docs/` for full details.
