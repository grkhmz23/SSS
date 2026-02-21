# Backend API

## Mint/Burn Service (`backend/mint-burn`)

- `GET /health`
- `POST /mint`
  - body: `{ "recipient": "<token-account>", "amount": "<u64>", "requestId": "..." }`
  - header: `x-request-signature` (verification stub)
- `POST /burn`
  - body: `{ "from": "<token-account>", "amount": "<u64>", "requestId": "..." }`
  - header: `x-request-signature`

## Indexer Service (`backend/indexer`)

- `GET /health`
- `GET /events?limit=100`

## Compliance Service (`backend/compliance`)

- `GET /health`
- `POST /blacklist/add`
  - body: `{ "wallet": "<pubkey>", "reason": "<text>" }`
- `POST /blacklist/remove`
  - body: `{ "wallet": "<pubkey>" }`
- `GET /blacklist/:wallet`
- `GET /audit/export?action=<action>&format=json|csv`
