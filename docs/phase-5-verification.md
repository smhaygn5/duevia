# Duevia Phase 5 verification

Verification date: 2026-07-27

## Automated results

| Check | Result |
| --- | --- |
| TypeScript typecheck | Passed |
| ESLint | Passed |
| Unit tests | 14 / 14 passed |
| Production build | Passed |
| Rendered page tests | 4 / 4 passed |
| Solidity tests | 9 / 9 passed |
| Arc Testnet factory runtime code | Confirmed |
| Factory USDC binding | Confirmed |
| Vercel production build | Passed |
| Public Vercel landing page | HTTP 200 |
| Vercel-to-Duevia API bridge | Confirmed |

## Security checks

- Factory deployment is restricted to the agreement client.
- Factory has no owner, upgrade, withdrawal, or fund-custody privilege.
- Each agreement receives an isolated escrow and immutable parties and terms.
- Server synchronization accepts only successful Arc receipts signed by the
  current authenticated wallet.
- Agreement reference, parties, total, milestone proofs, amounts, due dates,
  review windows, revision limits, and grace period are checked after escrow
  creation.
- Transaction hashes are unique in the activity ledger.
- Invitation and session secrets are stored only as hashes.
- Deliverable upload is restricted to the accepted provider and active escrow.
- Protected files use MIME signature validation, size limits, private R2
  access checks, `no-store`, and `nosniff`.
- The client and provider cannot execute each other's contract actions.

## Demo integrity

- Signed-out demo balances and events are visibly labeled as fictional sample
  data.
- Signed-in dashboard, agreement list, and activity views do not mix in demo
  records.
- Dashboard totals are derived from wallet-owned D1 agreement and milestone
  states synchronized from verified Arc Testnet transactions.
- Demo receipts do not expose an explorer link or present a sample hash as a
  real proof.
- If verified workspace data cannot be loaded, the application reports the
  error instead of substituting demo totals.

## Arc Testnet deployment

- Factory:
  `0x8097847f00e47Da0Bc6628A3e500215AAeE1fFad`
- Deployment transaction:
  `0x1759dd334012c32d69f852ef56c8424ed8cd16679c72c24db081ccd07e728215`
- Block: `53644077`
- Result: successful
- Runtime bytecode: confirmed at the factory address
- Factory USDC:
  `0x3600000000000000000000000000000000000000`
- Explorer:
  `https://testnet.arcscan.app/address/0x8097847f00e47Da0Bc6628A3e500215AAeE1fFad`

The hosted application now uses this confirmed factory. Contracts remain
unaudited and are permitted only for Arc Testnet use; no production funds are
permitted.

## Vercel production

- Public product: `https://duevia.vercel.app`
- Arc health route: confirmed on the public Vercel domain
- Backend bridge: authenticated server-to-server access; the bearer token is
  stored only as a sensitive Vercel Production environment variable
- Public access: production only; Vercel preview deployments remain protected
- Upload limit: 4 MB on Vercel to remain below the platform's 4.5 MB Function
  request limit
