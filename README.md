# Duevia

**Work in stages. Settle globally.**

Duevia is a global milestone agreement, protected delivery, USDC escrow, and
settlement application built on Arc. A client and a service provider agree on
sequential stages, fund one isolated escrow, submit proof of work, and release
USDC stage by stage.

## Phase 5 release

- Arc Testnet wallet connection and signed, gasless application sessions
- client- or provider-created agreements with private invitation links
- one ownerless escrow factory and one isolated escrow per accepted agreement
- exact client-only funding, provider-only delivery, and client-only approval
- Circle App Kit Bridge execution from supported testnets to Arc
- Circle Unified Balance discovery alongside direct Arc funding
- private D1 agreement records and protected R2 deliverables
- SHA-256 file proofs and keccak256 onchain submission proofs
- mutual cancellation, pre-work cancellation, deadline refund, and provider
  timeout release paths
- Arc transaction synchronization, human-readable activity, and verifiable
  receipts
- a complete no-value demo at `DV-7K2P`

Duevia contracts are unaudited and intended only for Arc Testnet. Do not use
this release with production funds.

Private production deployment:
`https://duevia-arc-testnet.celiluyanikoglu.chatgpt.site`

## Local development

Requirements: Node.js 22.13 or newer and npm.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run flow:check
npm run arc:check
npm run appkit:check
npm run test:contracts
```

The current release passes 12 unit tests, 4 rendered-page tests, and 9 Solidity
tests.

## Arc Testnet contract deployment

```bash
cd contracts
npm install
npm run deploy:arc
```

Set a testnet-only `ARC_TESTNET_PRIVATE_KEY` locally before deployment. Never
commit or paste the key into application code. Publish the confirmed factory
address as `NEXT_PUBLIC_DUEVIA_FACTORY_ADDRESS`, then rebuild the application.

## Documentation

- `docs/phase-3-architecture.md`
- `docs/phase-3-security.md`
- `docs/phase-4-product.md`
- `docs/phase-4-verification.md`
- `docs/phase-5-product.md`
- `docs/phase-5-verification.md`
- `docs/demo-script.md`
- `docs/builder-submission.md`
