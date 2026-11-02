# fee-sponsor-relay

[![CI](https://github.com/Stellar-Fee-Guild/fee-sponsor-relay/actions/workflows/ci.yml/badge.svg)](https://github.com/Stellar-Fee-Guild/fee-sponsor-relay/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A self-hostable relay for sponsoring Stellar transaction fees via
[`FeeBumpTransaction`](https://developers.stellar.org/docs/encyclopedia/fee-bump-transactions),
with a configurable policy engine, per-account/per-IP rate limiting, and full
audit logging built in.

## Table of contents

- [What is fee sponsorship, and why does it matter?](#what-is-fee-sponsorship-and-why-does-it-matter)
- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [Configuration reference](#configuration-reference)
- [API reference](#api-reference)
- [Deployment](#deployment)
- [Abuse protection](#abuse-protection)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## What is fee sponsorship, and why does it matter?

Every Stellar transaction pays a small fee, deducted from the transaction's
**source account**. That's a fine default, but it's a hard requirement for
anyone building a "gasless" experience: onboarding a user who doesn't have
XLM yet, running a game or app where you don't want players thinking about
fees, or subsidizing a specific class of transactions as a business decision.

Stellar's protocol-level answer to this is the `FeeBumpTransaction`: an
outer envelope that wraps an already-signed inner transaction and pays its
fee from a *different* account (the "fee source"), without needing the
inner transaction's source account to sign anything about the fee. The
inner transaction is built and signed exactly as it would be normally; a
sponsor then wraps it, signs the wrapper, and submits it.

**fee-sponsor-relay** is that wrapping step as a standalone, self-hosted
service: you run it, point it at your own sponsor account, configure who
and how much it's willing to sponsor, and any client can hand it an unsigned
inner transaction and get back a submission-ready, fee-bumped one.

## How it works

```
┌────────┐   unsigned inner tx XDR   ┌────────────────────┐
│ Client │ ───────────────────────▶  │  fee-sponsor-relay  │
└────────┘                           │                      │
                                     │  1. rate limit check │
                                     │  2. policy check     │
                                     │  3. wrap + sign       │
                                     └──────────┬───────────┘
                                                │ signed FeeBumpTransaction XDR
                                                ▼
                                        ┌───────────────┐
                                        │ Client submits │
                                        │ to Horizon     │
                                        └───────────────┘
```

The relay itself never submits transactions on the client's behalf by
default (`POST /sponsor` just returns the signed XDR) - the client submits
it to Horizon, staying in control of when and whether the transaction goes
out. `RelayService.submit()` is available if you want to build a variant
that submits directly.

## Quick start

Requires Node.js 18+.

```bash
git clone https://github.com/Stellar-Fee-Guild/fee-sponsor-relay.git
cd fee-sponsor-relay
npm install
cp .env.example .env
```

Generate a sponsor keypair and fund it (testnet, via
[Friendbot](https://developers.stellar.org/docs/tutorials/create-account/#create-account-testnet)):

```bash
node -e "const k=require('@stellar/stellar-sdk').Keypair.random();console.log('PUBLIC',k.publicKey());console.log('SECRET',k.secret())"
curl "https://friendbot.stellar.org?addr=<PUBLIC_KEY_FROM_ABOVE>"
```

Put the secret key in `.env` (`SPONSOR_SECRET_KEY=S...`), then:

```bash
npm run dev
```

The relay listens on `http://localhost:3000`. Try it:

```bash
curl http://localhost:3000/health
```

## Configuration reference

All configuration is via environment variables (see `.env.example` for a
ready-to-copy template).

### Stellar network

| Variable             | Default                                    | Description                                   |
| --------------------- | ------------------------------------------- | ---------------------------------------------- |
| `HORIZON_URL`         | `https://horizon-testnet.stellar.org`       | Horizon endpoint used to submit fee-bump txs.  |
| `NETWORK_PASSPHRASE`  | `Test SDF Network ; September 2015`         | Must match the network `HORIZON_URL` points to. |

### Sponsor account

| Variable                  | Default | Description                                                                                     |
| -------------------------- | ------- | ------------------------------------------------------------------------------------------------- |
| `SPONSOR_SECRET_KEY`       | -       | Secret key (`S...`) of the sponsor account. Avoid in production; prefer the file variant below.  |
| `SPONSOR_SECRET_KEY_FILE`  | -       | Path to a file containing only the sponsor secret key. Takes precedence over `SPONSOR_SECRET_KEY`. Use this with a mounted Docker/Kubernetes secret or a Vault agent template so the key never appears in env vars, shell history, or `docker inspect` output. |

The relay refuses to start if neither is set, or if the value isn't a valid
Stellar secret seed.

### HTTP server

| Variable    | Default | Description                                   |
| ----------- | ------- | ----------------------------------------------- |
| `PORT`      | `3000`  | HTTP port the relay listens on.                |
| `LOG_LEVEL` | `info`  | One of `debug`, `info`, `warn`, `error`.       |

### Policy: allow/deny lists

| Variable            | Default | Description                                                                 |
| -------------------- | ------- | ------------------------------------------------------------------------------ |
| `POLICY_ALLOWLIST`   | (empty) | Comma-separated source account public keys allowed to request sponsorship. Empty = allow any account not on the denylist. |
| `POLICY_DENYLIST`    | (empty) | Comma-separated source account public keys always rejected, regardless of the allowlist. |

### Policy: fee and cap limits

All amounts are in stroops (1 XLM = 10,000,000 stroops), and represent what
the **sponsor account actually pays** for a given fee-bump transaction
(`baseFee * (innerOperationCount + 1)`), not the inner transaction's own
nominal fee field.

| Variable                                  | Default      | Description                                                   |
| ------------------------------------------ | ------------- | ---------------------------------------------------------------- |
| `POLICY_MAX_FEE_STROOPS_PER_TX`           | `1000000`     | Max the relay will pay to sponsor a single transaction.        |
| `POLICY_HOURLY_CAP_STROOPS_PER_ACCOUNT`   | `5000000`     | Max sponsored per source account in any rolling 1-hour window. |
| `POLICY_DAILY_CAP_STROOPS_PER_ACCOUNT`    | `20000000`    | Max sponsored per source account in any rolling 24-hour window. |

### Policy: transaction validity window

| Variable                          | Default | Description |
| --------------------------------- | ------- | ----------- |
| `POLICY_MAX_TX_VALIDITY_SECONDS`  | `300`   | Furthest in the future an inner transaction's `maxTime` may be, in seconds. |

The sponsor's fee-bump signature stays valid for exactly as long as the inner
transaction's time bounds allow. Without a limit, a client could hold a
sponsored fee bump and submit it hours or months later, after you've
tightened the policy or changed budgets, and the sponsor would still pay.
Inner transactions with no `maxTime`, a `maxTime` of `0` (an infinite
timeout) or a `maxTime` further out than this are rejected with
`INVALID_INNER_TRANSACTION`. Clients should build with
`TransactionBuilder.setTimeout(n)` where `n` is at most this value.

### Rate limiting

| Variable                             | Default | Description                                   |
| -------------------------------------- | ------- | ------------------------------------------------ |
| `RATE_LIMIT_PER_ACCOUNT_PER_MINUTE`   | `10`    | Max `/sponsor` requests per source account/min. |
| `RATE_LIMIT_PER_IP_PER_MINUTE`        | `30`    | Max `/sponsor` requests per source IP/min.      |

## API reference

### `POST /sponsor`

Validates an unsigned inner transaction against policy and rate limits,
wraps it in a `FeeBumpTransaction`, signs it with the sponsor key, and
returns the signed XDR. The relay does **not** submit it to Horizon.

**Request body**

```json
{ "transaction": "<base64 unsigned inner transaction XDR>" }
```

**Success response** — `200 OK`

```json
{
  "approved": true,
  "sourceAccount": "GABC...",
  "innerFeeStroops": 200,
  "feeBumpTransactionXdr": "<base64 signed FeeBumpTransaction XDR>"
}
```

**Rejection response** — `400`/`403`/`429` depending on the reason

```json
{
  "approved": false,
  "reason": "DAILY_CAP_EXCEEDED",
  "detail": "Account GABC... would exceed its daily cap of 20000000 stroops (already used 19900000).",
  "sourceAccount": "GABC...",
  "innerFeeStroops": 500000
}
```

| `reason`                     | HTTP status | Meaning                                                        |
| ------------------------------ | ------------- | ------------------------------------------------------------------ |
| `INVALID_TRANSACTION_XDR`    | 400         | Missing/malformed `transaction`, or it's already a fee-bump tx. |
| `DENYLISTED_ACCOUNT`         | 403         | Source account is on the denylist.                            |
| `NOT_ALLOWLISTED`            | 403         | Allowlist is non-empty and the account isn't on it.            |
| `FEE_EXCEEDS_MAX`            | 403         | Sponsor cost exceeds `POLICY_MAX_FEE_STROOPS_PER_TX`.          |
| `HOURLY_CAP_EXCEEDED`        | 403         | Would exceed the account's rolling hourly cap.                |
| `DAILY_CAP_EXCEEDED`         | 403         | Would exceed the account's rolling daily cap.                  |
| `ACCOUNT_RATE_LIMITED`       | 429         | Too many requests from this source account this minute.       |
| `IP_RATE_LIMITED`            | 429         | Too many requests from this source IP this minute.            |

Every decision (approved or rejected) is written to the structured log via
`sponsorshipDecision`, for auditability.

### `GET /health`

Liveness/readiness probe.

```json
{ "status": "ok", "sponsorPublicKey": "GABC..." }
```

## Deployment

### Docker

```bash
mkdir -p secrets
echo "S..." > secrets/sponsor_secret_key
docker compose up --build
```

`docker-compose.yml` mounts `secrets/sponsor_secret_key` read-only into the
container and points `SPONSOR_SECRET_KEY_FILE` at it, so the secret never
appears in `docker inspect` output or the container's environment listing.
Override any policy/rate-limit variable via a `.env` file next to
`docker-compose.yml` (see `.env.example`).

### Bare metal / systemd / PaaS

```bash
npm ci
npm run build
SPONSOR_SECRET_KEY_FILE=/run/secrets/sponsor.key node dist/index.js
```

Wherever you deploy, treat the sponsor secret key like any other production
credential: inject it via your platform's secret manager (Kubernetes
Secret, Vault, AWS Secrets Manager, etc.) mounted as a file, and set
`SPONSOR_SECRET_KEY_FILE` rather than putting the raw key in an env var if
your platform lets you avoid it.

## Abuse protection

- **Rate limiting** (`src/rateLimiter.ts`) - independent per-source-account
  and per-source-IP limits, checked before any policy or transaction
  parsing work happens.
- **Policy engine** (`src/policy.ts`) - allow/deny lists, a max sponsored
  fee per transaction, and rolling hourly/daily sponsorship caps per
  account.
- **Audit logging** (`src/logger.ts`) - every sponsorship decision, approved
  or rejected, is logged as a structured `sponsorship_decision` event with
  the reason.

The current rate limiter and policy engine both keep state in memory, which
is process-local. If you run more than one relay instance behind a load
balancer, each instance enforces caps independently - see the issue tracker
for a Redis-backed rate limiter and shared-state work.

## Development

```bash
npm install
npm run lint          # ESLint
npm run format:check  # Prettier
npm run typecheck     # tsc --noEmit
npm run test:unit     # unit tests + coverage (threshold: 85%)
npm run test:integration  # real testnet fee-bump submission (needs network)
npm run build          # compile to dist/
```

## Contributing

Contributions are welcome - see [CONTRIBUTING.md](CONTRIBUTING.md) for how
to pick up an issue, branch naming, and the PR process, and
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community guidelines. Check
the [issue tracker](https://github.com/Stellar-Fee-Guild/fee-sponsor-relay/issues)
for a curated set of well-scoped issues across trivial/medium/high
complexity.

## License

[MIT](LICENSE)
