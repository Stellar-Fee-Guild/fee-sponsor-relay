# Planned issues

Twenty scoped issues for `fee-sponsor-relay`, for contributors in the Drips Wave Stellar Program.
They are **not on GitHub yet**: the numbers below (#1–#20) are local to this file, and GitHub
will assign new ones. Existing GitHub issues are always written as links, e.g. [GitHub #18](https://github.com/Stellar-Fee-Guild/fee-sponsor-relay/issues/18). Trivial issues come first and are good first issues.
See [CONTRIBUTING.md](CONTRIBUTING.md) for branch names and the checks to run before opening a PR.

These deliberately don't duplicate open issues: Prometheus metrics ([GitHub #18](https://github.com/Stellar-Fee-Guild/fee-sponsor-relay/issues/18)), multiple sponsor
accounts ([GitHub #14](https://github.com/Stellar-Fee-Guild/fee-sponsor-relay/issues/14)), load testing ([GitHub #20](https://github.com/Stellar-Fee-Guild/fee-sponsor-relay/issues/20)), a Redis rate limiter ([GitHub #12](https://github.com/Stellar-Fee-Guild/fee-sponsor-relay/issues/12)), shared state for
horizontal scaling ([GitHub #19](https://github.com/Stellar-Fee-Guild/fee-sponsor-relay/issues/19)), the policy DSL ([GitHub #17](https://github.com/Stellar-Fee-Guild/fee-sponsor-relay/issues/17)) and pluggable policy modules ([GitHub #11](https://github.com/Stellar-Fee-Guild/fee-sponsor-relay/issues/11))
are already tracked. [GitHub #7](https://github.com/Stellar-Fee-Guild/fee-sponsor-relay/issues/7) (JSON for unknown routes) is fixed on the `chore/relay-improvements`
branch.

Labels used: a size (`trivial`, `medium`, `high`), a type (`enhancement`, `bug`, `docs`,
`chore`, `security`, `testing`), `good first issue`, and `needs client change` / `needs engine
change` when work is also needed in
[fee-sponsor-client](https://github.com/Stellar-Fee-Guild/fee-sponsor-client) or
[sponsor-policy-engine](https://github.com/Stellar-Fee-Guild/sponsor-policy-engine).

| #   | Title                                                                 | Size    | Labels                                                     | Depends on                       |
| --- | --------------------------------------------------------------------- | ------- | ---------------------------------------------------------- | -------------------------------- |
| 1   | Reject inner transactions that have already expired                   | trivial | good first issue, enhancement                              |                                  |
| 2   | Add a correctly named `sponsorCostStroops` response field             | trivial | good first issue, enhancement, needs client change         |                                  |
| 3   | Send `Retry-After` on 429 responses                                   | trivial | good first issue, enhancement                              |                                  |
| 4   | Allow `http://` Horizon URLs for local development                    | trivial | good first issue, enhancement                              |                                  |
| 5   | Load `.env` automatically in `npm run dev`                            | trivial | good first issue, chore                                    |                                  |
| 6   | Build and smoke-test the Docker image in CI                           | trivial | good first issue, chore, testing                           |                                  |
| 7   | Report the relay version in `GET /health`                             | trivial | good first issue, enhancement                              |                                  |
| 8   | Add a `GET /ready` readiness endpoint that checks the sponsor balance | medium  | enhancement                                                | Shares the threshold with #9.    |
| 9   | Warn when the sponsor balance runs low                                | medium  | enhancement                                                |                                  |
| 10  | API-key authentication                                                | medium  | enhancement, security, needs client change                 |                                  |
| 11  | Publish an OpenAPI spec and test responses against it                 | medium  | docs, testing                                              |                                  |
| 12  | Operation-type and contract allowlist                                 | medium  | enhancement, needs client change                           |                                  |
| 13  | Upgrade `@stellar/stellar-sdk` from v12                               | medium  | chore                                                      | Unblocks part of #17.            |
| 14  | Optional `POST /sponsor/submit` mode                                  | medium  | enhancement                                                |                                  |
| 15  | Deployment guides, Render blueprint and `fly.toml`                    | medium  | docs                                                       | Blocks #20.                      |
| 16  | `POST /quote`: check sponsorship before the user signs                | high    | enhancement, needs client change                           | #2 recommended first.            |
| 17  | Correct fee handling for Soroban transactions                         | high    | bug, enhancement, needs client change, needs engine change | Easier after #13.                |
| 18  | Signed requests: authenticate calling apps with ed25519               | high    | enhancement, security, needs client change                 | Build on #10's auth middleware.  |
| 19  | Helm chart and container image publishing                             | high    | enhancement, chore                                         | Uses `/ready` from #8 if merged. |
| 20  | Hosted testnet demo                                                   | high    | enhancement, docs                                          | Depends on #15; uses #9.         |

---

## #1 Reject inner transactions that have already expired

**Labels:** `trivial`, `good first issue`, `enhancement`

### Context

`assertValidityWindow` in `src/relay.ts` rejects inner transactions whose `maxTime` is missing,
`0` or too far in the future (`POLICY_MAX_TX_VALIDITY_SECONDS`). It doesn't check the other end:
a transaction whose `maxTime` is already in the past is wrapped, signed, and returned, and then
fails on submission with `tx_too_late`. Rejecting it up front gives the client a clear error and
doesn't spend rate-limit or policy budget on a transaction that can't succeed.

### Acceptance criteria

- [ ] `assertValidityWindow` throws `InvalidInnerTransactionError` when `maxTime` is earlier
      than `nowMs`, with a detail such as `Inner transaction expired at <maxTime> (now <now>).
    Rebuild it with a fresh timeout.`
- [ ] Unit tests in `test/unit/relay.test.ts` using the injectable `nowMs`, including the
      boundary (`maxTime === now` is still accepted).
- [ ] A server test in `test/unit/server.test.ts` expecting `400` `INVALID_INNER_TRANSACTION`.
- [ ] README `POST /sponsor` requirements list and rejection table mention expiry.
- [ ] CHANGELOG entry under `Unreleased`.

### Files to touch

`src/relay.ts`, `test/unit/relay.test.ts`, `test/unit/server.test.ts`, `README.md`, `CHANGELOG.md`

### Constraints

- **Compatibility:** non-breaking in practice: only transactions that would fail on submission
  get a new rejection. Uses the existing `INVALID_INNER_TRANSACTION` reason.
- No new env vars.

---

## #2 Add a correctly named `sponsorCostStroops` response field

**Labels:** `trivial`, `good first issue`, `enhancement`, `needs client change`

### Context

`POST /sponsor` returns `innerFeeStroops`, but the value is the **total sponsor cost**,
`baseFee * (opCount + 1)`, computed by `sponsorCostStroops()` in `src/relay.ts`, not the inner
transaction's fee. The README now explains this, but the name keeps misleading integrators:
fee-sponsor-client's `SponsorResult` documents it as "inner transaction fee"
([`src/types.ts`](https://github.com/Stellar-Fee-Guild/fee-sponsor-client/blob/main/src/types.ts),
[`src/client.ts`](https://github.com/Stellar-Fee-Guild/fee-sponsor-client/blob/main/src/client.ts)).
Adding a correctly named field alongside it lets clients migrate without a breaking change.

### Acceptance criteria

- [ ] `SponsorshipDecision` in `src/types.ts` gains `sponsorCostStroops?: Stroops`, with TSDoc on
      both fields; `innerFeeStroops` is marked `@deprecated` (kept, same value).
- [ ] `src/server.ts` sets `sponsorCostStroops` wherever it sets `innerFeeStroops` (approvals and
      policy rejections).
- [ ] The audit log entry (`SponsorshipAuditLogEntry`) gets the same field.
- [ ] Server tests assert both fields are present and equal.
- [ ] README response table and CHANGELOG updated.
- [ ] A linked fee-sponsor-client issue to read `sponsorCostStroops` when present and fix its
      `innerFeeStroops` doc comment.

### Files to touch

`src/types.ts`, `src/server.ts`, `test/unit/server.test.ts`, `README.md`, `CHANGELOG.md`

### Constraints

- **Compatibility:** non-breaking (additive). Do **not** remove or rename `innerFeeStroops`.
- **Needs client change:** follow-up in
  [fee-sponsor-client](https://github.com/Stellar-Fee-Guild/fee-sponsor-client) (not blocking).

---

## #3 Send `Retry-After` on 429 responses

**Labels:** `trivial`, `good first issue`, `enhancement`

### Context

`IP_RATE_LIMITED` and `ACCOUNT_RATE_LIMITED` rejections in `src/server.ts` return `429` with no
hint of when to retry. fee-sponsor-client already honours a `Retry-After` header when present.
`RateLimiter` in `src/rateLimiter.ts` uses fixed one-minute windows, so 60 seconds is always a
safe upper bound.

### Acceptance criteria

- [ ] Both 429 responses set `Retry-After: 60` (seconds), from a constant derived from the
      rate-limit window rather than a literal in `server.ts`.
- [ ] When CORS is enabled (`src/cors.ts`), responses also send
      `Access-Control-Expose-Headers: Retry-After` so browser code can read it.
- [ ] Server tests for both reasons, and a CORS test for the expose header.
- [ ] README rejection section documents the header.

### Files to touch

`src/server.ts`, `src/rateLimiter.ts` (export the window constant), `src/cors.ts`,
`test/unit/server.test.ts`, `test/unit/cors.test.ts`, `README.md`

### Constraints

- **Compatibility:** non-breaking (additive header).
- A precise per-key value (time until the window resets) is out of scope. It will come from
  sponsor-policy-engine's `retryAfterMs`
  ([engine #9](https://github.com/Stellar-Fee-Guild/sponsor-policy-engine/issues/9)) once the
  relay depends on the engine.

---

## #4 Allow `http://` Horizon URLs for local development

**Labels:** `trivial`, `good first issue`, `enhancement`

### Context

`RelayService`'s constructor in `src/relay.ts` calls `new Horizon.Server(horizonUrl)`, which
throws `Cannot connect to insecure horizon server` for any `http://` URL. So the relay can't
start against a local [stellar/quickstart](https://github.com/stellar/quickstart) container at
`http://localhost:8000`, the usual setup for offline development and standalone networks.

### Acceptance criteria

- [ ] New env var `ALLOW_HTTP_HORIZON` (default `false`), parsed in `src/config.ts` like
      `SKIP_STARTUP_CHECKS`, passed to `RelayService` and on to `new Horizon.Server(url, { allowHttp })`.
- [ ] `loadConfig` throws a `ConfigError` naming both variables if `HORIZON_URL` is `http://`
      and `ALLOW_HTTP_HORIZON` isn't `true`, instead of the SDK's error at construction.
- [ ] The relay logs a warning at startup when `ALLOW_HTTP_HORIZON=true` and
      `NETWORK_PASSPHRASE` is the public network passphrase.
- [ ] Config tests; `.env.example`, `docker-compose.yml` and README configuration reference updated.

### Files to touch

`src/config.ts`, `src/types.ts`, `src/relay.ts`, `src/index.ts`, `test/unit/config.test.ts`,
`.env.example`, `docker-compose.yml`, `README.md`

### Constraints

- **Compatibility:** non-breaking; off by default.

---

## #5 Load `.env` automatically in `npm run dev`

**Labels:** `trivial`, `good first issue`, `chore`

### Context

The Quick start has users `cp .env.example .env`, but nothing loads that file: `npm run dev`
(`tsx watch src/index.ts`) only sees the shell's environment, so the relay fails with
`No sponsor secret key configured`. The README currently works around it with
`set -a && . ./.env && set +a`, which doesn't work on Windows shells.

### Acceptance criteria

- [ ] `npm run dev` loads `.env` when it exists and still starts (using defaults) when it
      doesn't.
- [ ] `npm start`, `node dist/index.js` and the Docker image do **not** load `.env` implicitly.
      Production config stays explicit.
- [ ] README Quick start drops the `set -a` workaround.
- [ ] Works on Node 18 (the `engines` minimum) or the PR explains why `engines` changes.

### Files to touch

`package.json`, `README.md`, `CONTRIBUTING.md` (development setup)

### Constraints

- No new **runtime** dependency. A dev dependency or a Node/tsx flag is fine.
- **Compatibility:** non-breaking.

---

## #6 Build and smoke-test the Docker image in CI

**Labels:** `trivial`, `good first issue`, `chore`, `testing`

### Context

`.github/workflows/ci.yml` lints, typechecks, tests and builds with `tsc`, but never builds the
`Dockerfile`. A broken `COPY`, a missing file in `.dockerignore`, or a change to the runtime
stage would only show up when an operator deploys. The image is also the easiest place to check
that graceful shutdown (`src/shutdown.ts`) works as PID 1.

### Acceptance criteria

- [ ] A `docker` job in `ci.yml` runs `docker build -t fee-sponsor-relay:ci .`.
- [ ] It starts the container with a throwaway sponsor key (generated in the job, never
      committed) and `SKIP_STARTUP_CHECKS=true`, waits for `GET /health` to return 200, then runs
      `docker stop` and asserts the container exited with code `0`.
- [ ] The job runs on pull requests and doesn't push the image anywhere.

### Files to touch

`.github/workflows/ci.yml`

### Constraints

- **Compatibility:** CI only.

---

## #7 Report the relay version in `GET /health`

**Labels:** `trivial`, `good first issue`, `enhancement`

### Context

`GET /health` in `src/server.ts` returns `{ status, sponsorPublicKey }`. Operators running several
instances, and client authors debugging a report, can't tell which relay version answered.

### Acceptance criteria

- [ ] `/health` adds `version` (from `package.json`) and, when the `GIT_COMMIT` env var is set,
      `commit`.
- [ ] The version is read at startup in a way that works from `dist/` and in the Docker image
      (note `tsconfig.build.json` has `rootDir: src`, so importing `../package.json` won't build
      as-is).
- [ ] The `Dockerfile` accepts a `GIT_COMMIT` build arg and sets it as an env var.
- [ ] Server test asserts the field; README `/health` example updated; `GIT_COMMIT` documented in
      `.env.example`, `docker-compose.yml` and the README configuration reference.

### Files to touch

`src/server.ts`, `src/index.ts`, `src/config.ts`, `Dockerfile`, `test/unit/server.test.ts`,
`.env.example`, `docker-compose.yml`, `README.md`

### Constraints

- **Compatibility:** non-breaking (additive field).

---

## #8 Add a `GET /ready` readiness endpoint that checks the sponsor balance

**Labels:** `medium`, `enhancement`

### Context

`GET /health` is a liveness probe: it never contacts Horizon. Kubernetes and load balancers need a
readiness probe that fails when the relay can't usefully sponsor anything: Horizon unreachable,
the sponsor account missing, or its balance too low to pay fees. `src/startupChecks.ts` already
has an injectable `HorizonProbe` (`createHorizonProbe`) that loads the account and its native
balance. Readiness can reuse it.

### Acceptance criteria

- [ ] `GET /ready` returns `200 { "status": "ready", "checks": { ... } }` when Horizon answers,
      the sponsor account exists and (if configured) its XLM balance is at least
      `SPONSOR_MIN_BALANCE_XLM`; otherwise `503 { "status": "not_ready", "checks": { ... } }`
      saying which check failed.
- [ ] Results are cached for `READY_CACHE_SECONDS` (default `15`) so probes don't hammer Horizon;
      concurrent requests share one in-flight check.
- [ ] Horizon calls have a timeout. A slow Horizon yields `503`, not a hung probe.
- [ ] Unit tests with a fake `HorizonProbe` covering each state and the cache.
- [ ] README API reference plus a Kubernetes probe example (`/health` liveness, `/ready`
      readiness). New env vars in `config.ts` with tests, `.env.example`, `docker-compose.yml` and
      README.

### Files to touch

`src/server.ts`, `src/startupChecks.ts` (or a new `src/readiness.ts`), `src/config.ts`,
`src/types.ts`, `src/index.ts`, tests, `.env.example`, `docker-compose.yml`, `README.md`

### Constraints

- **Compatibility:** non-breaking (new endpoint). The Dockerfile `HEALTHCHECK` stays on `/health`.
- Coordinate `SPONSOR_MIN_BALANCE_XLM` with #9 so both use the same threshold variable.

---

## #9 Warn when the sponsor balance runs low

**Labels:** `medium`, `enhancement`

### Context

When the sponsor account runs out of XLM, every fee bump fails on submission
(`tx_insufficient_balance` on the fee source) and operators find out from users. The relay logs
the balance once at startup (`sponsor_account_loaded` in `src/startupChecks.ts`) but never again.

### Acceptance criteria

- [ ] With `SPONSOR_LOW_BALANCE_XLM` set (unset = disabled), the relay checks the sponsor balance
      every `SPONSOR_BALANCE_CHECK_INTERVAL_SECONDS` (default `300`) using `HorizonProbe`.
- [ ] Logs `sponsor_balance_low` at `warn` when the balance first drops below the threshold, and
      `sponsor_balance_recovered` at `info` when it goes back above. No log spam on every tick.
- [ ] Failed checks log a warning and don't crash or stop the timer.
- [ ] The timer is `unref()`ed and stopped during graceful shutdown (`src/shutdown.ts`).
- [ ] Tests with fake timers and a fake probe; env vars in `config.ts` with tests,
      `.env.example`, `docker-compose.yml` and README.

### Files to touch

New `src/balanceMonitor.ts`, `src/index.ts`, `src/shutdown.ts`, `src/config.ts`, `src/types.ts`,
tests, `.env.example`, `docker-compose.yml`, `README.md`

### Constraints

- **Compatibility:** non-breaking; off by default.
- Keep the monitor's state readable (current balance, low or not) so [GitHub #18](https://github.com/Stellar-Fee-Guild/fee-sponsor-relay/issues/18) (Prometheus) can export
  it as a gauge later, without implementing metrics here.

---

## #10 API-key authentication

**Labels:** `medium`, `enhancement`, `security`, `needs client change`

### Context

Anyone who can reach `POST /sponsor` can spend the sponsor's budget, within the policy and rate
limits. Operators running a shared relay want to know which app is calling and refuse unknown
callers. fee-sponsor-client already plans an `apiKey` option and is waiting on this
([client #15](https://github.com/Stellar-Fee-Guild/fee-sponsor-client/issues/15), marked
`needs relay change`), which asks for a documented header, status code and rejection reason.

### Acceptance criteria

- [ ] `API_KEYS_FILE` points to a file with one `label:key` per line (blank lines and `#`
      comments allowed). Unset = authentication disabled (today's behaviour).
- [ ] When enabled, `POST /sponsor` requires `Authorization: Bearer <key>`. Missing or unknown
      keys get `401` `{ "approved": false, "reason": "UNAUTHORIZED", "detail": "..." }` before
      any rate-limit or policy work. `/health` (and `/ready`, if present) stay open.
- [ ] Keys are compared in constant time (for example `crypto.timingSafeEqual` on SHA-256
      digests). Keys are never logged; the audit log records the key's `label`.
- [ ] When CORS is enabled, the preflight allows the `Authorization` header (`src/cors.ts`).
- [ ] `UNAUTHORIZED` added to `SponsorshipRejectionReason` in `src/types.ts`.
- [ ] Tests for missing, malformed, unknown and valid keys, the file format, and CORS.
- [ ] README: security notes (keys in browser code are public identifiers, not secrets) and the
      configuration reference; `.env.example`, `docker-compose.yml` updated.

### Files to touch

New `src/auth.ts`, `src/server.ts`, `src/cors.ts`, `src/config.ts`, `src/types.ts`,
`src/logger.ts`, tests, `.env.example`, `docker-compose.yml`, `README.md`, `CHANGELOG.md`

### Constraints

- **Compatibility:** non-breaking when disabled (the default). Adds a rejection reason.
- **Needs client change:** [client #15](https://github.com/Stellar-Fee-Guild/fee-sponsor-client/issues/15)
  adds the `apiKey` option once this ships.
- Per-key rate limits and per-key policies are out of scope (follow-up issue).
- No new runtime dependencies.

---

## #11 Publish an OpenAPI spec and test responses against it

**Labels:** `medium`, `docs`, `testing`

### Context

The HTTP contract lives in README tables and in `src/types.ts` (`SponsorshipDecision`,
`SponsorshipRejectionReason`). Client authors in other languages have nothing machine-readable,
and nothing stops the README, the types and the actual responses drifting apart.

### Acceptance criteria

- [ ] `openapi.yaml` (OpenAPI 3.1) describes `POST /sponsor`, `OPTIONS /sponsor`, `GET /health`,
      every status code (200, 400, 403, 404, 413, 429, 500), the request body, the decision
      schema, and the full `reason` enum.
- [ ] A test validates real supertest responses from `test/unit/server.test.ts` scenarios against
      the spec (dev dependency such as `ajv` is fine).
- [ ] A test fails if the spec's `reason` enum and `SponsorshipRejectionReason` differ. If
      [GitHub #4](https://github.com/Stellar-Fee-Guild/fee-sponsor-relay/issues/4) (typed constant list of reasons) has landed, use that list.
- [ ] README links to the spec. CONTRIBUTING says API changes must update it.

### Files to touch

New `openapi.yaml`, new `test/unit/openapi.test.ts`, `package.json` (dev dependencies),
`README.md`, `CONTRIBUTING.md`

### Constraints

- **Compatibility:** docs and tests only; no runtime dependency. Serving the spec over HTTP is
  optional and must not add a dependency.

---

## #12 Operation-type and contract allowlist

**Labels:** `medium`, `enhancement`, `needs client change`

### Context

The policy (`src/policy.ts`) only looks at the source account and fee. An operator who wants to
sponsor "only payments" or "only calls to my Soroban contract" can't. The relay will sponsor an
`accountMerge`, `manageData` or any contract call from an allowlisted account. This needs XDR
inspection, so it belongs in the relay, not in sponsor-policy-engine (which has no Stellar SDK
dependency). Keep it a plain, focused check that the policy DSL ([GitHub #17](https://github.com/Stellar-Fee-Guild/fee-sponsor-relay/issues/17)) or pluggable
modules ([GitHub #11](https://github.com/Stellar-Fee-Guild/fee-sponsor-relay/issues/11)) can later wrap.

### Acceptance criteria

- [ ] `POLICY_ALLOWED_OPERATION_TYPES`: comma-separated SDK operation types (e.g.
      `payment,pathPaymentStrictSend,invokeHostFunction`). Empty = allow all. Unknown names are a
      `ConfigError` at startup.
- [ ] `POLICY_ALLOWED_CONTRACT_IDS`: comma-separated `C...` contract IDs. When set, every
      `invokeHostFunction` operation must be an `invokeContract` call to one of them. Validated
      with `StrKey`.
- [ ] Violations return `403` with a new reason `OPERATION_NOT_ALLOWED` and a detail naming the
      operation index and type, after rate limiting and before the fee policy.
- [ ] Docs state clearly that only top-level operations are checked: contracts called by an
      allowed contract (sub-invocations in auth entries) are not restricted.
- [ ] Unit tests per operation type, contract match and mismatch, and config parsing.
- [ ] `.env.example`, `docker-compose.yml`, README configuration and rejection tables updated.

### Files to touch

New `src/operationPolicy.ts`, `src/server.ts`, `src/config.ts`, `src/types.ts`, tests,
`.env.example`, `docker-compose.yml`, `README.md`, `CHANGELOG.md`

### Constraints

- **Compatibility:** non-breaking; off by default. Adds a rejection reason.
- **Needs client change:** add `OPERATION_NOT_ALLOWED` to fee-sponsor-client's
  `SponsorshipRejectionReason` (not blocking; the client already tolerates unknown reasons).
- No engine change.

---

## #13 Upgrade `@stellar/stellar-sdk` from v12

**Labels:** `medium`, `chore`

### Context

The relay pins `@stellar/stellar-sdk` `^12.3.0`, several majors behind. Newer majors bring
protocol updates and Soroban fixes the relay will need (see #17). Dependabot is configured to
ignore SDK majors (`.github/dependabot.yml`) because the upgrade needs a deliberate review.

### Acceptance criteria

- [ ] Upgrade to the latest major and work through every changelog entry between v12 and it,
      listing in the PR the ones that affect the relay (imports of `Horizon`, `TransactionBuilder`,
      `FeeBumpTransaction`, `Keypair`, `StrKey`, `MuxedAccount`; time-bounds and signature APIs).
- [ ] Check the new version's `engines`. If it drops Node 18, update `package.json` `engines`,
      the CI Node version and README, and flag it as breaking for operators in the CHANGELOG.
- [ ] Re-check `buildFeeBumpTransaction`'s fee calculation for Soroban transactions and note the
      result on #17.
- [ ] All unit tests pass unchanged, or changes are explained; run `npm run test:integration`
      against testnet and paste the result in the PR.
- [ ] `docker build .` still works.

### Files to touch

`package.json`, `package-lock.json`, `src/**/*.ts` as needed, `.github/workflows/ci.yml`,
`README.md`, `CHANGELOG.md`

### Constraints

- **Compatibility:** no HTTP API changes. Possibly breaking for operators if the Node minimum
  changes.
- Coordinate with fee-sponsor-client, which pins its SDK dev dependency for Node 18 support.

---

## #14 Optional `POST /sponsor/submit` mode

**Labels:** `medium`, `enhancement`

### Context

`POST /sponsor` returns a signed fee bump and leaves submission to the client. Some integrators
(server-to-server, constrained devices) would rather have the relay submit it. `RelayService.submit()`
in `src/relay.ts` already wraps `Horizon.Server.submitTransaction` but nothing calls it outside the
integration test.

### Acceptance criteria

- [ ] `SUBMIT_ENDPOINT_ENABLED` (default `false`). When `false`, `POST /sponsor/submit` is a `404`
      like any unknown route.
- [ ] Same validation, rate limits and policy as `/sponsor`. Factor the shared pipeline out of the
      `/sponsor` handler in `src/server.ts` rather than duplicating it.
- [ ] On success returns `200` with the `/sponsor` fields plus `hash`, `ledger` and `successful`.
- [ ] Horizon `400` transaction failures return `422` with
      `{ "approved": true, "submitted": false, "resultCodes": {...} }`. Timeouts and `504` return
      `202` with the hash and `"status": "pending"`, documented as "look the hash up before
      resubmitting".
- [ ] Spend is recorded with `policy.recordSponsorship` once the fee bump is signed, whether or
      not submission succeeds (fees can be charged on failure). Documented.
- [ ] Tests with `RelayService.submit` mocked; README API reference;
      `.env.example`, `docker-compose.yml` updated.

### Files to touch

`src/server.ts`, `src/relay.ts`, `src/config.ts`, `src/types.ts`, `src/index.ts`, tests,
`.env.example`, `docker-compose.yml`, `README.md`, `CHANGELOG.md`

### Constraints

- **Compatibility:** non-breaking; off by default. `/sponsor` behaviour unchanged.
- The client can add a matching method later (optional follow-up, not required here).

---

## #15 Deployment guides, Render blueprint and `fly.toml`

**Labels:** `medium`, `docs`

### Context

The README covers Docker Compose and bare metal. The common PaaS targets each need the same
handful of decisions made correctly: mount the sponsor key as a file (`SPONSOR_SECRET_KEY_FILE`),
set `TRUST_PROXY` (every one of them puts a proxy in front), give graceful shutdown more than
10 seconds, use `/health` for health checks, and stay at one instance while state is in memory
([GitHub #19](https://github.com/Stellar-Fee-Guild/fee-sponsor-relay/issues/19)).

### Acceptance criteria

- [ ] `docs/deploy/render.md`, `docs/deploy/fly.md` and `docs/deploy/kubernetes.md` (plain
      manifests), each covering: secret key as a file, `TRUST_PROXY` value, health check, grace
      period, `CORS_ALLOWED_ORIGINS`, single-instance caveat, and how to verify with `curl`.
- [ ] A `render.yaml` blueprint and a `fly.toml` at the repo root (or under `deploy/`) that build
      from the `Dockerfile`, with `TRUST_PROXY=1` and the health check on `/health`.
- [ ] Each guide was tested on testnet by the contributor; the PR says how.
- [ ] README Deployment section links to the guides.

### Files to touch

New `docs/deploy/*.md`, `render.yaml`, `fly.toml`, `README.md`

### Constraints

- **Compatibility:** docs and config only. No secrets in committed files.

---

## #16 `POST /quote`: check sponsorship before the user signs

**Labels:** `high`, `enhancement`, `needs client change`

### Context

An app only learns whether a transaction will be sponsored after the user has signed it. If the
relay then rejects it (`NOT_ALLOWLISTED`, `DAILY_CAP_EXCEEDED`), the user signed for nothing.
fee-sponsor-client plans a `quote()` method and is waiting on a relay endpoint
([client #20](https://github.com/Stellar-Fee-Guild/fee-sponsor-client/issues/20)).
`PolicyEngine.evaluate` in `src/policy.ts` is already side-effect free, so a dry run is possible.

### Acceptance criteria

- [ ] A short design section in the PR (or `docs/quote.md`) settling: does a quote count against
      rate limits (recommended: a separate, more generous bucket), and does it reserve budget
      (recommended: no, quotes are advisory).
- [ ] `POST /quote` takes `{ "transaction": "<XDR>" }`, which **may be unsigned**. Runs XDR
      parsing, operation and time-bound checks, rate limits and `policy.evaluate`, but never
      signs, never calls `recordSponsorship`, and returns no fee bump.
- [ ] Response: `{ "approved": boolean, "reason"?, "detail"?, "sponsorCostStroops", "sourceAccount" }`
      with the same status codes as `/sponsor`.
- [ ] `parseInnerTransaction` in `src/relay.ts` gets an option to skip the signature checks,
      without weakening `/sponsor`.
- [ ] Tests, including "a quote doesn't consume budget"; README and OpenAPI (if #11 landed).

### Files to touch

`src/server.ts`, `src/relay.ts`, `src/types.ts`, `src/rateLimiter.ts`, tests, `README.md`,
`CHANGELOG.md`

### Constraints

- **Compatibility:** non-breaking (new endpoint).
- **Needs client change:** [client #20](https://github.com/Stellar-Fee-Guild/fee-sponsor-client/issues/20).
- Do #2 first so `sponsorCostStroops` is the field name from day one.

---

## #17 Correct fee handling for Soroban transactions

**Labels:** `high`, `bug`, `enhancement`, `needs client change`, `needs engine change`

### Context

For a Soroban transaction the inner `fee` is the inclusion fee **plus** the resource fee
declared in its `sorobanData`. `requiredBaseFeeStroops()` in `src/relay.ts` divides the whole fee
by the operation count, and the SDK v12 `buildFeeBumpTransaction` (used by
`RelayService.wrapAndSign`) sets the outer fee to `baseFee * (ops + 1)` with no Soroban special
case. So a one-operation contract call with fee `F` is bumped with a max fee of `2F`: the
resource fee is counted twice, `innerFeeStroops` reports `2F`, and policy caps
(`FEE_EXCEEDS_MAX`, hourly and daily caps) are charged `2F`, rejecting legitimate calls early.
The protocol only requires `inclusionFeeRate * (ops + 1) + resourceFee`.

### Acceptance criteria

- [ ] For transactions with Soroban data, the required base fee is computed from the inclusion
      fee (`fee - resourceFee`), and the sponsor cost is `baseFee * (ops + 1) + resourceFee`.
      Classic transactions are unchanged.
- [ ] The fee bump is built with that fee, either via a newer SDK that handles it (see #13) or
      by building the envelope directly. The fee bump is accepted by testnet.
- [ ] A `POLICY_MAX_RESOURCE_FEE_STROOPS` limit (unset = no extra limit), since resource fees
      can be far larger than classic fees.
- [ ] Unit tests with a fixture Soroban transaction XDR (checked into `test/fixtures/`), and an
      integration test in `test/integration/` that sponsors a contract invocation on testnet.
- [ ] README documents the Soroban cost formula.

### Files to touch

`src/relay.ts`, `src/server.ts`, `src/config.ts`, `src/types.ts`, `test/unit/relay.test.ts`,
new `test/fixtures/`, `test/integration/`, `.env.example`, `docker-compose.yml`, `README.md`,
`CHANGELOG.md`

### Constraints

- **Compatibility:** fixes cost reporting for Soroban transactions (lower `innerFeeStroops`); no
  change for classic transactions. Call it out in the CHANGELOG.
- **Needs client change:** fee-sponsor-client's `estimateSponsorCost` and the `FEE_MISMATCH`
  check in `verifyFeeBump` must use the same formula, or every Soroban fee bump fails
  verification. Coordinate with
  [client #17](https://github.com/Stellar-Fee-Guild/fee-sponsor-client/issues/17).
- **Needs engine change:** the shared fee helper
  ([engine #3](https://github.com/Stellar-Fee-Guild/sponsor-policy-engine/issues/3),
  `feeBumpCostStroops`) must accept a resource fee so relay and client can't drift.

---

## #18 Signed requests: authenticate calling apps with ed25519

**Labels:** `high`, `enhancement`, `security`, `needs client change`

### Context

API keys (#10) are bearer tokens, and in browsers they're public. Backends calling the relay can
do better: sign each request with an ed25519 key the relay knows, so the relay can authenticate
the app, reject replays and attribute spend. fee-sponsor-client plans a `requestSigner` hook and
is waiting on a relay spec
([client #19](https://github.com/Stellar-Fee-Guild/fee-sponsor-client/issues/19)).

### Acceptance criteria

- [ ] A spec in `docs/signed-requests.md`: signed payload (method, path, SHA-256 of the body,
      timestamp, nonce), header names, encoding, allowed clock skew (default 60 s), replay
      protection, key registration, and the `401` rejection reasons (e.g. `INVALID_SIGNATURE`,
      `STALE_REQUEST`, `REPLAYED_REQUEST`).
- [ ] `APP_KEYS_FILE` with one `label:G...` public key per line. Unset = disabled.
- [ ] Signature verification uses the raw request body, captured before JSON parsing
      (`express.json`'s `verify` option), and `Keypair.verify` from the SDK.
- [ ] Nonces are remembered for the skew window in a bounded in-memory store; document that
      multiple instances need shared state ([GitHub #19](https://github.com/Stellar-Fee-Guild/fee-sponsor-relay/issues/19)).
- [ ] Shares the auth middleware and audit-log `label` with #10 if it has landed; both modes can
      be enabled at once.
- [ ] Tests: valid, tampered body, wrong key, stale timestamp, replayed nonce, missing headers.
- [ ] README, `.env.example`, `docker-compose.yml`, CHANGELOG.

### Files to touch

New `src/requestSignature.ts`, `src/server.ts`, `src/config.ts`, `src/types.ts`, tests,
new `docs/signed-requests.md`, `.env.example`, `docker-compose.yml`, `README.md`, `CHANGELOG.md`

### Constraints

- **Compatibility:** non-breaking; off by default.
- **Needs client change:** [client #19](https://github.com/Stellar-Fee-Guild/fee-sponsor-client/issues/19).
- No new runtime dependencies (`node:crypto` and the Stellar SDK cover it).

---

## #19 Helm chart and container image publishing

**Labels:** `high`, `enhancement`, `chore`

### Context

Kubernetes is a common target, and getting the details right by hand is error-prone: mounting
the key as a file, running as non-root, probes, grace period, `TRUST_PROXY` behind an ingress,
and keeping `replicas: 1` while rate limits and caps are in memory ([GitHub #19](https://github.com/Stellar-Fee-Guild/fee-sponsor-relay/issues/19)). There's
also no published image, so a chart has nothing to pull.

### Acceptance criteria

- [ ] A release workflow that builds the `Dockerfile` and pushes multi-arch (`amd64`, `arm64`)
      images to `ghcr.io/stellar-fee-guild/fee-sponsor-relay` on `v*` tags, with provenance.
- [ ] `charts/fee-sponsor-relay` with a Deployment (non-root, read-only root filesystem, dropped
      capabilities), a Secret or existing-secret reference mounted for `SPONSOR_SECRET_KEY_FILE`,
      a Service, an optional Ingress, liveness on `/health`, readiness on `/ready` if #8 has
      landed (otherwise `/health`), and `terminationGracePeriodSeconds` above the relay's 10 s
      shutdown timeout.
- [ ] `values.yaml` exposes every env var in the README configuration reference; `TRUST_PROXY`
      defaults to `1` when the Ingress is enabled.
- [ ] `replicaCount` defaults to `1`, with a comment explaining why.
- [ ] CI runs `helm lint` and installs the chart in a kind cluster, then checks `/health`.
- [ ] `charts/fee-sponsor-relay/README.md` and a link from the main README.

### Files to touch

New `charts/fee-sponsor-relay/**`, new `.github/workflows/release.yml`,
`.github/workflows/ci.yml`, `README.md`

### Constraints

- **Compatibility:** packaging only; no code changes.
- Never put a real key in `values.yaml` or examples.

---

## #20 Hosted testnet demo

**Labels:** `high`, `enhancement`, `docs`

### Context

There's no way to try the relay without running it. A public testnet relay plus a small web page
that sponsors a payment end to end, using fee-sponsor-client in the browser, would show the
whole flow (sign, sponsor, verify, submit) and exercise CORS, `TRUST_PROXY` and the startup
checks in a real deployment.

### Acceptance criteria

- [ ] A testnet relay deployed with the blueprint from #15, with a tight policy (low per-tx max
      and caps, low rate limits) and `CORS_ALLOWED_ORIGINS` set to the demo page's origin only.
- [ ] `examples/demo/`: a static page that creates a testnet keypair (or uses Freighter), funds
      it via Friendbot, builds and signs a payment with a short timeout, sponsors it with
      fee-sponsor-client, and submits it, showing each step and any rejection reason.
- [ ] The page is deployed to GitHub Pages by a workflow.
- [ ] Sponsor balance is monitored (#9) and topped up from Friendbot by a scheduled job.
- [ ] `docs/demo.md` runbook: where it runs, who has access, how to rotate the sponsor key.
- [ ] README links to the demo with a clear "testnet only" notice.

### Files to touch

New `examples/demo/**`, new workflow under `.github/workflows/`, new `docs/demo.md`, `README.md`

### Constraints

- **Compatibility:** no relay code changes expected; if any are needed, open separate issues.
- Testnet only. The sponsor key lives in the hosting platform's secret store, never in the repo.
- Depends on #15; uses #9 for monitoring.
