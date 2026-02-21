# SSS-2 Specification

SSS-2 extends SSS-1 with compliance controls.

## Mandatory additional capabilities

- `ComplianceRecord` PDA lookup keyed by `(mint, wallet)`.
- Token-2022 `PermanentDelegate` extension for seize path.
- Token-2022 `TransferHook` extension with blacklist checks.
- Additional instructions:
  - `add_to_blacklist`
  - `remove_from_blacklist`
  - `seize`

## Feature gate behavior

- If compliance is disabled at initialization:
  - `add_to_blacklist`, `remove_from_blacklist`, `seize` fail with a deterministic program error.
- SDK surfaces this as `ComplianceDisabledError`.
