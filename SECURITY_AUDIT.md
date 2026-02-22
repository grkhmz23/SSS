# Security Audit Report — Solana Stablecoin Standard (SSS)

Date: 2026-02-22
Branch: `security/audit-20260221`

## Executive Summary (Top 5 Risks)
1) **Critical** — Transfer-hook configuration could be initialized by an unauthorized party, enabling compliance bypass or hook takeover.
2) **Critical** — Mint/Burn service accepted any request with a header present, enabling remote mint/burn by unauthenticated callers.
3) **High** — Compliance service allowed unauthenticated blacklist changes and audit export.
4) **High** — Mint/Burn endpoints accepted `requestId` but did not enforce idempotency, allowing replay/race mints or burns.
5) **High** — Indexer webhook URL allowed SSRF with no allowlist or URL validation.

## Findings Table
| ID | Severity | Component | Description |
| --- | --- | --- | --- |
| SSS-001 | Critical | Transfer Hook Program | Unauthorized `initialize_hook` allowed hook config takeover and compliance bypass. |
| SSS-002 | Critical | Mint/Burn Service | Authentication stub accepted any caller with a header. |
| SSS-003 | High | Compliance Service | No auth on blacklist mutations or audit export. |
| SSS-004 | High | Mint/Burn Service | No idempotency enforcement despite `requestId` field. |
| SSS-005 | High | Indexer | Webhook URL not allowlisted; SSRF possible. |
| SSS-006 | Medium | Program Governance | Master authority transfer not gated by pause. **FIXED** |

## Detailed Findings

### SSS-001 — Unauthorized Transfer-Hook Initialization
**Severity:** Critical

**Impact:** An attacker could initialize the hook config PDA for a mint before the legitimate admin, point it at attacker-controlled config/program accounts, and either bypass compliance checks or route seizures unexpectedly.

**Exploit Scenario:** Attacker calls `initialize_hook` first with a malicious `stablecoin_config` and `stablecoin_program`, then transfers are governed by attacker-controlled state. Admin cannot recover without updating the hook config with attacker-defined authority.

**Affected Files/Lines:**
- `programs/sss-transfer-hook/src/lib.rs` (pre-fix behavior; fixed in `programs/sss-transfer-hook/src/lib.rs:20` and `:60`)

**Remediation:** Require master authority signature and validate `stablecoin_config` ownership, mint, and transfer-hook enabled flag during initialization. Fix implemented in `programs/sss-transfer-hook/src/lib.rs:20`.

---

### SSS-002 — Mint/Burn API Auth Stub
**Severity:** Critical

**Impact:** Any network caller could mint or burn tokens by sending a request with a header, enabling unauthorized supply changes.

**Exploit Scenario:** Attacker issues `POST /mint` or `POST /burn` with arbitrary payload and a dummy `x-request-signature` header. The service mints/burns with issuer keypair.

**Affected Files/Lines:**
- `backend/mint-burn/src/index.ts:66` (auth enforcement added)

**Remediation:** Implement HMAC signature verification using a shared secret and raw body, and reject requests without valid signatures. Fix in `backend/mint-burn/src/index.ts:66` and `backend/shared/src/auth.ts`.

---

### SSS-003 — Compliance API Unauthenticated Admin Endpoints
**Severity:** High

**Impact:** Any network caller could blacklist/unblacklist wallets or export audit data.

**Exploit Scenario:** Attacker calls `POST /blacklist/add` to freeze a victim, or `POST /blacklist/remove` to clear sanctioned wallets.

**Affected Files/Lines:**
- `backend/compliance/src/index.ts:24` (auth added for admin endpoints)

**Remediation:** Require HMAC signatures on blacklist and audit export endpoints. Fix in `backend/compliance/src/index.ts:24` and `backend/shared/src/auth.ts`.

---

### SSS-004 — Mint/Burn Idempotency Bypass
**Severity:** High

**Impact:** Duplicate or replayed requests with the same `requestId` can mint/burn multiple times (race or retry behavior), causing unintended supply changes.

**Exploit Scenario:** Attacker submits the same `requestId` concurrently and triggers multiple mints before the first request is recorded.

**Affected Files/Lines:**
- `backend/mint-burn/src/index.ts:121` (idempotency added)
- `backend/shared/src/db.ts:33` (new `mint_burn_requests` table)

**Remediation:** Add a `mint_burn_requests` table with a unique `(action, request_id)` constraint. Reserve ids before mint/burn, return prior signature or conflict if in-progress. Fix in `backend/mint-burn/src/index.ts` and `backend/shared/src/db.ts`.

---

### SSS-005 — Webhook SSRF
**Severity:** High

**Impact:** Configured webhook could target internal services or metadata endpoints, enabling SSRF and data exfiltration.

**Exploit Scenario:** Operator (or attacker who can influence config) sets `WEBHOOK_URL` to internal IP or sensitive metadata endpoint.

**Affected Files/Lines:**
- `backend/indexer/src/index.ts:131`

**Remediation:** Require an allowlist via `WEBHOOK_ALLOWED_HOSTS` and validate URL scheme/host. Fix implemented in `backend/shared/src/webhook.ts` and `backend/indexer/src/index.ts:131`.

---

### SSS-006 — Master Authority Transfer Not Paused
**Severity:** Medium

**Impact:** Authority can be rotated while the system is active, increasing operational risk during key rotation or incident response.

**Exploit Scenario:** A compromised master key can be rotated without first pausing, potentially allowing a window of inconsistent policy enforcement.

**Affected Files/Lines:**
- `programs/sss-stablecoin/src/lib.rs` (`transfer_authority` does not require `paused`)

**Remediation:** Require `paused == true` for authority transfer. Implemented in `programs/sss-stablecoin/src/lib.rs:transfer_authority` with new `NotPaused` error variant.

## Fixes Applied
- Enforced authenticated transfer-hook initialization and validated stablecoin config ownership/mint/authority. (`programs/sss-transfer-hook/src/lib.rs`)
- Added HMAC request signature verification in mint-burn and compliance services. (`backend/shared/src/auth.ts`, `backend/mint-burn/src/index.ts`, `backend/compliance/src/index.ts`)
- Implemented idempotency control for mint/burn with a new `mint_burn_requests` table. (`backend/shared/src/db.ts`, `backend/mint-burn/src/index.ts`, `backend/mint-burn/src/idempotency.ts`)
- Added webhook URL allowlist validation to prevent SSRF. (`backend/shared/src/webhook.ts`, `backend/indexer/src/index.ts`)
- Updated SDK transfer-hook initialization to include authority signer and new accounts. (`sdk/core/src/index.ts`, `sdk/core/src/idl/sssTransferHook.ts`)
- Added tests for signature verification, webhook allowlist, idempotency, and transfer-hook authorization. (`backend/shared/src/auth.test.ts`, `backend/shared/src/webhook.test.ts`, `backend/mint-burn/src/idempotency.test.ts`, `tests/integration/sss2-flow.test.ts`)
- **SSS-006**: Gated `transfer_authority` behind `paused` requirement. (`programs/sss-stablecoin/src/lib.rs`)
- Fixed dependency resolution for solana-program 1.18.x compatibility. (`Cargo.toml`, `programs/sss-stablecoin/Cargo.toml`)

## Remaining Recommendations (Non-Blocking)
- Add request rate-limiting on mint/burn endpoints.
- Add structured logging redaction tests for secrets.
- Consider timeouts/retries for RPC calls in backend services.
- Monitor upstream `bigint-buffer` vulnerability (GHSA-3gc7-fjrx-p6mg) for patched release.

## Tooling / Scanner Notes
Environment setup completed:
- ✅ `cargo` — Installed rustup with nightly toolchain
- ✅ `anchor` — Installed anchor-cli 0.30.1 via npm
- ✅ `pnpm` — Installed dependencies and tests pass
- ❌ `anchor build` — Fails due to vendored cargo edition2024 incompatibility; use `cargo build` instead
- ✅ `cargo fmt --check` — Pass
- ✅ `cargo clippy` — Pass (with `-A unexpected_cfgs` for Anchor macros)
- ✅ `cargo test` — Pass
- ✅ `pnpm -r test` — Pass (integration tests skipped without RUN_ANCHOR_TESTS=1)
- ⚠️ `pnpm audit --prod` — 1 high severity vulnerability in `bigint-buffer` (upstream dependency of @solana/spl-token, no patched version available)
- ✅ `docker compose build` — Dry-run passes (full build requires more time)

Artifacts from executed commands are saved under `audit/artifacts/`.
