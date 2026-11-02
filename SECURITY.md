# Security policy

fee-sponsor-relay holds a key that spends real money on mainnet, so we take
security reports seriously and appreciate responsible disclosure.

## Supported versions

Security fixes go into `main` and the next release. The project is pre-1.0;
please run a recent version.

## Reporting a vulnerability

**Please don't report vulnerabilities in public issues, pull requests or
discussions.**

Report privately through GitHub:
[Security → Report a vulnerability](https://github.com/Stellar-Fee-Guild/fee-sponsor-relay/security/advisories/new).
If that link isn't available, open a public issue that only asks a
maintainer for a private contact, with no details of the problem.

Please include:

- what an attacker can do (for example drain the sponsor account, bypass a
  policy cap or rate limit, or make the relay sign something it shouldn't);
- the relay version or commit, and the relevant configuration with secrets
  removed;
- steps or a proof of concept, preferably on testnet.

We aim to acknowledge reports within 5 working days and to agree a
disclosure date with you once a fix is ready. We're happy to credit you in
the advisory.

## Never share sponsor keys

**Never post a sponsor secret key (`S...`), a `.env` file or the contents of
`SPONSOR_SECRET_KEY_FILE` in an issue, pull request, log excerpt or chat**,
not even a testnet key. Maintainers will never ask for one. Redact keys from
anything you paste; public keys (`G...`) are fine.

If a key has been exposed, treat it as compromised: create a new sponsor
account, move the funds to it, point `SPONSOR_SECRET_KEY_FILE` at the new
key, and remove the old key as a signer (or merge the old account).

## Scope

In scope: this repository's code, Dockerfile and documented configuration.
Out of scope: vulnerabilities in Stellar Core, Horizon or
`@stellar/stellar-sdk` (report those to the Stellar Development Foundation),
and attacks that need the operator's own misconfiguration, such as setting
`TRUST_PROXY` with no proxy in front, unless our documentation recommends
that configuration.
