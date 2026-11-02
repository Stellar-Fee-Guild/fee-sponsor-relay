# Contributing to fee-sponsor-relay

Thanks for your interest in contributing. This project is maintained as
part of the Stellar Fee Guild, and we welcome contributions of all sizes -
from a typo fix to a new feature.

## Picking up an issue

- Browse the [issue tracker](https://github.com/Stellar-Fee-Guild/fee-sponsor-relay/issues).
  Issues are labeled `trivial`, `medium`, or `high` to indicate scope and
  effort, and each one includes a description, acceptance criteria, and
  pointers to the relevant files.
- Comment on the issue before starting significant work, so two people
  don't end up duplicating effort. For `trivial` issues you can generally
  just open a PR directly.
- If an issue is unclear or you think the acceptance criteria are wrong,
  say so in a comment - don't guess silently and submit something
  different from what was asked.
- If you want to propose something that isn't already an issue, open one
  first describing the problem and your proposed approach, and wait for a
  maintainer to weigh in before writing code, so you don't spend time on
  something that gets redesigned in review.

## Development setup

```bash
git clone https://github.com/Stellar-Fee-Guild/fee-sponsor-relay.git
cd fee-sponsor-relay
npm install
cp .env.example .env
```

See the [README](README.md#development) for the full list of scripts
(`lint`, `typecheck`, `test:unit`, `test:integration`, `build`).

## Branch naming

Branch off `main` using one of these prefixes:

- `feat/<short-description>` - new functionality
- `fix/<short-description>` - bug fixes
- `docs/<short-description>` - documentation-only changes
- `chore/<short-description>` - tooling, CI, dependency updates

Example: `feat/redis-rate-limiter`, `fix/policy-daily-cap-off-by-one`.

## Making changes

- Keep PRs focused on one issue. If you find something else worth fixing
  along the way, open a separate issue/PR for it rather than bundling it
  in.
- Add or update tests for any behavior change. New modules should be
  unit-tested; changes that touch the HTTP API should be covered by the
  supertest suite in `test/unit/server.test.ts`.
- Run the full check suite locally before opening a PR:

  ```bash
  npm run lint
  npm run format:check
  npm run typecheck
  npm run test:unit
  npm run build
  ```

- Update `README.md` if you add or change a config option, API field, or
  deployment step - the config reference and API reference tables are the
  source of truth for operators.
- **Adding an environment variable?** Parse and validate it in
  `src/config.ts` (with tests in `test/unit/config.test.ts`), make it off by
  default where that's safe, and update `.env.example` (with a comment),
  `docker-compose.yml` and the README configuration reference in the same PR.
- **Changing API behaviour?** New response fields are fine; changing a status
  code, a `reason`, or the shape of an existing response is a breaking change
  for clients such as
  [fee-sponsor-client](https://github.com/Stellar-Fee-Guild/fee-sponsor-client).
  Call it out in the PR and add a `CHANGELOG.md` entry under `Unreleased`.
- Write clear commit messages describing *why* a change was made, not just
  what changed.

## Pull request process

1. Push your branch and open a PR against `main`.
2. Fill in the PR template: what changed, why, and how you tested it. Its
   checklist includes: tests added, checks passing, and for any new env var,
   `.env.example`, `docker-compose.yml` and the README updated.
3. Link the issue the PR addresses (e.g. `Closes #42`).
4. CI must pass (lint, typecheck, unit tests with coverage, build) before a
   PR can be merged. The testnet integration job is informational and
   won't block merging.
5. Address review feedback with additional commits rather than force-
   pushing over history mid-review, so reviewers can see what changed
   between passes. Feel free to tidy up commits with a rebase once review
   is done and before merge.
6. A maintainer will merge once the PR is approved and CI is green.

## Reporting bugs / requesting features

Open an issue with:

- What you expected to happen vs. what actually happened.
- Steps to reproduce (for bugs), including relevant config/env vars
  (redact any real secret keys).
- Your environment: Node version, OS, and whether you're using Docker.

## Code style

- TypeScript, strict mode. Avoid `any`; if you need an escape hatch, prefer
  `unknown` with a narrowing check.
- Formatting is enforced by Prettier and linting by ESLint - `npm run
  lint:fix` and `npm run format` will fix most issues automatically.
- Keep modules focused: policy logic belongs in `src/policy.ts`, rate
  limiting in `src/rateLimiter.ts`, inner-transaction validation and fee
  maths in `src/relay.ts`, HTTP concerns in `src/server.ts` (with CORS in
  `src/cors.ts`), configuration in `src/config.ts`, and process lifecycle in
  `src/shutdown.ts` and `src/startupChecks.ts`. If you're not sure where
  something belongs, ask in the PR or issue.
- No new runtime dependencies without discussing it in an issue first.
  Small things (CORS, error handling, logging) are hand-written on purpose.
