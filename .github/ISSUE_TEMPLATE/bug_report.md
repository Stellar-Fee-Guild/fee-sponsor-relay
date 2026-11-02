---
name: Bug report
about: The relay behaves differently from the documentation
title: 'fix: '
labels: bug
---

<!--
Never paste a sponsor secret key (S...), a .env file or the contents of
SPONSOR_SECRET_KEY_FILE. Public keys (G...) are fine.
Security issues: don't file them here. See SECURITY.md.
-->

## What happened

<!-- A clear description of the bug, including the HTTP status and response body if relevant. -->

## Reproduction

<!-- Request you sent (redact secrets), relevant env vars, and the relay's log lines. -->

```bash
curl -X POST http://localhost:3000/sponsor \
  -H 'Content-Type: application/json' \
  -d '{"transaction": "AAAA..."}'
```

## Expected behaviour

<!-- What should have happened, ideally with a link to the README section. -->

## Environment

- Relay version / commit:
- Running via: Docker / docker compose / Node directly / PaaS (which?)
- Node version (if not Docker):
- Network: testnet / mainnet / other
- Behind a proxy or load balancer? (`TRUST_PROXY` value):
- Client (fee-sponsor-client version, or other):
