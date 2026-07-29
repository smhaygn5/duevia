# Duevia

**Work in stages. Settle globally.**

Duevia is a global milestone agreement, protected delivery, USDC escrow, and
settlement application built on Arc. A client and a service provider agree on
sequential stages, fund one isolated escrow, submit proof of work, and release
USDC stage by stage.

## Phase 5 release

- Arc Testnet wallet connection and signed, gasless application sessions
- EIP-6963 installed-wallet discovery with explicit MetaMask, OKX, and other
  EVM wallet selection
- client- or provider-created agreements with private invitation links
- one ownerless escrow factory and one isolated escrow per accepted agreement
- a confirmed Arc Testnet factory at
  `0x8097847f00e47Da0Bc6628A3e500215AAeE1fFad`
- exact client-only funding, provider-only delivery, and client-only approval
- Circle App Kit Bridge execution from supported testnets to Arc
- Circle Gateway Unified Balance estimation and execution alongside direct Arc
  and Bridge funding
- private D1 agreement records and protected R2 deliverables
- SHA-256 file proofs and keccak256 onchain submission proofs
- mutual cancellation, pre-work cancellation, deadline refund, and provider
  timeout release paths
- Arc transaction synchronization, human-readable activity, and verifiable
  receipts
- durable wallet-auth request limits and browser security headers
- pull-request checks for both the application and Solidity contracts
- a complete no-value demo at `DV-7K2P`

## Demo and verified data

Duevia deliberately separates presentation data from wallet-owned records:

- signed-out visitors see a clearly labeled guided demo with fictional parties,
  sample balances, and no broadcast transactions
- signed-in users see only agreements linked to their Arc Testnet wallet
- dashboard totals are calculated from persisted agreement and milestone states
  synchronized from verified Arc transactions
- explorer links appear only when a verified transaction hash exists

No demo balance or activity is substituted when an authenticated workspace
cannot load its real records.

Duevia contracts are unaudited and intended only for Arc Testnet. Do not use
this release with production funds.

Production deployment:
`https://duevia.vercel.app`

Public repository:
`https://github.com/smhaygn5/duevia`

The Vercel surface runs the public Next.js application and securely proxies
authenticated API traffic to Duevia's private D1/R2 backend.

## Local development

Requirements: Node.js 24.16.x and npm 11.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Verification

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run flow:check
npm run appkit:check
npm run build:vercel
npm run build
npm run test:rendered
npm run arc:check
npm run factory:check
npm run test:contracts
```

The current release passes 37 unit tests, 4 rendered-page tests, and 9 Solidity
tests.

## Arc Testnet contract deployment

```bash
cd contracts
npm install
npm run deploy:arc
```

Set a testnet-only `ARC_TESTNET_PRIVATE_KEY` locally before deployment. Never
commit or paste the key into application code. The confirmed deployment is
recorded in `contracts/deployments/arc-testnet.json` and can be inspected on
[Arcscan](https://testnet.arcscan.app/address/0x8097847f00e47Da0Bc6628A3e500215AAeE1fFad).

## Documentation

- `docs/phase-3-architecture.md`
- `docs/phase-3-security.md`
- `docs/phase-4-product.md`
- `docs/phase-4-verification.md`
- `docs/phase-5-product.md`
- `docs/phase-5-verification.md`
- `docs/demo-script.md`
- `docs/builder-submission.md`
- `docs/vercel-deployment.md`
- `docs/operations-runbook.md`
- `docs/two-wallet-checklist.md`
- `SECURITY.md`
