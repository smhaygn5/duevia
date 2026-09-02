# Duevia testnet operations runbook

## Release boundary

This runbook covers the Arc Testnet builder release. Contracts are unaudited,
and production funds are prohibited.

## Automated release checks

Every branch push and pull request runs:

- TypeScript and ESLint checks;
- application unit, local-flow, and rendered-page tests;
- Circle App Kit capability verification;
- Vercel and Cloudflare-compatible production builds;
- Solidity compilation, type checking, and the full contract test suite.

Live RPC and factory checks remain deliberate release checks because public
testnet availability can be transient:

```bash
npm run arc:check
npm run factory:check
```

## Health and monitoring

- Application health: `/api/health/arc`
- Factory: `0x8097847f00e47Da0Bc6628A3e500215AAeE1fFad`
- Expected Arc chain ID: `5042002`
- Primary RPC: `https://rpc.testnet.arc.network`
- Fallback RPC: `https://arc-testnet.drpc.org`

Alert on repeated HTTP 5xx responses, Arc chain-ID mismatches, backend bridge
503 responses, signature verification failures, and sustained 429 responses.
Never log signatures, session cookies, invitation tokens, protected file
contents, or bearer tokens.

The `Production health` GitHub workflow checks the public health endpoint every
30 minutes and can also be run manually. It verifies both the application
response and the expected Arc Testnet chain ID. This is an availability signal,
not a replacement for independent uptime monitoring: configure a separate
uptime check against the same endpoint before a public demo.

## Data protection

- D1 is the authoritative application record.
- R2 is private and contains only protected deliverable bytes.
- D1 stores file ownership and integrity metadata.
- Session and invitation values are stored only as hashes.
- Export D1 before schema or deployment changes.
- Keep scheduled D1 exports and R2 retention in a separately protected
  environment.
- Verify a restore in a non-production environment before relying on a backup.

### Backup execution checklist

Before a public demo, assign one owner for each item below and record the most
recent successful restore test:

1. Schedule a D1 export before every schema or deployment change and retain
   the export outside the serving account.
2. Enable a private R2 retention policy appropriate for protected deliverables.
3. Test a D1 import and a protected-file metadata restore in a non-production
   environment at least once per release cycle.
4. Keep the backup location and recovery access separate from normal deploy
   credentials. Do not put recovery credentials in Vercel or GitHub variables.

## Request protection

Wallet challenge and signature verification routes use a durable D1-backed
window limit. A limited request receives HTTP 429 and `Retry-After`; the wallet
flow should wait rather than immediately retry.

The Vercel surface accepts protected deliverables up to 4 MB so multipart
metadata remains below the platform's 4.5 MB request limit. This is an
intentional testnet limit, not a silent upload failure.

## Secrets

- `DUEVIA_BACKEND_BEARER_TOKEN` is server-only and must be rotated after any
  suspected exposure.
- `ARC_TESTNET_PRIVATE_KEY` is deployment-only and must never be used by the
  application runtime.
- No secret may use a `NEXT_PUBLIC_*` name.
- Preview and production environments must not share production credentials.

## Rollback

1. Stop new testnet demonstrations if authorization, data, or settlement state
   is suspect.
2. Roll the public application back to the last verified deployment.
3. Keep D1 and R2 intact; do not delete evidence during investigation.
4. Confirm `/api/health/arc`, wallet sign-in, and a no-value demo before
   reopening.
5. Record the affected deployment, transaction hashes, and remediation without
   including secrets.

## Final two-wallet acceptance

Use two separate testnet-only wallets and follow `docs/two-wallet-checklist.md`.
The release remains a draft until that checklist passes.
