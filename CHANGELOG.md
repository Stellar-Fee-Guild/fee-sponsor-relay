# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Breaking API changes

These are the only intentional changes to API behaviour. Everything else is
backwards compatible.

- **Unsigned, empty, wrong-network and long-lived inner transactions are now
  rejected** with `400` and reason `INVALID_INNER_TRANSACTION` (previously
  reserved and unused). That covers inner transactions with no signatures, no
  operations, a source-account signature that doesn't verify under
  `NETWORK_PASSPHRASE`, or a `maxTime` that is missing, `0`, or more than
  `POLICY_MAX_TX_VALIDITY_SECONDS` (default `300`) in the future. Unsigned
  transactions used to get a fee bump that could never succeed. Unparseable
  XDR, fee bumps passed as the inner transaction and a missing `transaction`
  field still return `INVALID_TRANSACTION_XDR`.
- **Errors are JSON.** Malformed JSON bodies return `400` and bodies over 64 KB
  return `413`, both as `{ "approved": false, "reason": "INVALID_TRANSACTION_XDR", "detail": "..." }`.
  Unknown routes return `404` `{ "error": "Not found" }` and unexpected errors
  `500` `{ "error": "Internal server error" }`, instead of Express's HTML pages.

### Added

- `POLICY_MAX_TX_VALIDITY_SECONDS` (default `300`): the furthest in the future
  an inner transaction's `maxTime` may be, so a sponsored fee bump can't be
  held and submitted much later.
- `TRUST_PROXY` (default unset): Express's `trust proxy` setting, so per-IP rate
  limiting uses the real client IP behind a load balancer or reverse proxy.
- `CORS_ALLOWED_ORIGINS` (default empty, no CORS headers): lets browser apps,
  such as ones using fee-sponsor-client, call the relay. Handles `OPTIONS
  /sponsor` preflights.
- Graceful shutdown on `SIGTERM` and `SIGINT`: in-flight requests get up to 10
  seconds to finish.
- Startup checks that warn (without exiting) when the sponsor account can't be
  loaded from Horizon or `NETWORK_PASSPHRASE` doesn't match Horizon's network.
  Disable with `SKIP_STARTUP_CHECKS=true`.
- `CHANGELOG.md`, `SECURITY.md`, issue and pull request templates, Dependabot
  configuration and `ISSUES.md`.

### Changed

- The `x-powered-by` header is no longer sent.
- `docker-compose.yml` sets `stop_grace_period: 15s` and passes the new
  variables through.

### Fixed

- README: inner transactions must be **signed** by their source account (the
  docs said unsigned), `innerFeeStroops` is documented as the total sponsor
  cost (`baseFee * (opCount + 1)`), and the Quick start explains how to load
  `.env`.

[Unreleased]: https://github.com/Stellar-Fee-Guild/fee-sponsor-relay/commits/main
