## Summary

<!-- What does this PR change and why? -->

Closes #

## Type of change

- [ ] Bug fix (`fix/`)
- [ ] New feature (`feat/`)
- [ ] Documentation (`docs/`)
- [ ] Tooling / maintenance (`chore/`)
- [ ] Breaking change to the HTTP API (status codes, `reason` values or response shapes)

## How was this tested?

<!-- Unit tests, manual curl against testnet, docker build... -->

## Checklist

- [ ] `npm run lint` and `npm run format:check` pass
- [ ] `npm run typecheck` passes
- [ ] `npm run test:unit` passes and coverage thresholds are met
- [ ] `npm run build` passes
- [ ] Tests added or updated for the change
- [ ] New env vars: validated in `src/config.ts` with tests, and `.env.example`, `docker-compose.yml` and README updated
- [ ] README / CHANGELOG updated if behaviour or API changed
- [ ] No runtime dependencies added
- [ ] No secret keys in code, tests, logs or screenshots
