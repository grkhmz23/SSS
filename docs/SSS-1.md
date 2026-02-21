# SSS-1 Specification

## Mandatory capabilities

- Token-2022 mint with mint/freeze authority and on-chain metadata support.
- RBAC with dedicated authorities (master + operation roles).
- Time-window minter quotas.
- Core instructions:
  - `initialize`
  - `mint`
  - `burn`
  - `freeze_account`
  - `thaw_account`
  - `pause`
  - `unpause`
  - `update_minter`
  - `update_roles`
  - `transfer_authority`
- Event emission for all sensitive actions.

## Prohibited in SSS-1

- Compliance blacklist controls.
- Seize operations.
- Transfer-hook blacklist enforcement.
