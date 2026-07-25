# Duevia Phase 5 product

## Outcome

Duevia is a global, role-aware milestone settlement product on Arc Testnet.
The release connects the agreement database, protected deliverables, Circle
funding preparation, Duevia escrow contracts, and Arc receipts into one
coherent workflow.

## End-to-end workflow

1. Either party creates one to eight sequential USDC milestones.
2. The counterparty joins through a private, hashed invitation token.
3. The client deploys an isolated Duevia escrow through the ownerless factory.
4. Duevia verifies every onchain term against the accepted D1 agreement.
5. The client approves exactly the agreement total and funds the escrow.
6. The provider starts the current milestone, uploads protected deliverables,
   and records a keccak256 submission proof on Arc.
7. The client downloads the delivery and either requests a bounded revision or
   approves the exact milestone release.
8. Duevia synchronizes the signed Arc transaction and produces a receipt.
9. Contract conditions expose mutual cancellation, pre-work cancellation,
   non-delivery refund, and review-timeout release without support custody.

## Why Arc is material

- USDC is the settlement asset and the network gas experience remains
  stablecoin-native.
- Circle App Kit can execute supported testnet USDC routes into Arc before
  escrow funding.
- The Arc transaction is the source of truth for funding, stage state, release,
  and refund.
- Every meaningful application state transition requires a successful receipt
  emitted by the expected escrow.

## Product boundaries

- The demo is clearly disclosed and never broadcasts value.
- Unified Balance is exposed for balance discovery; executable funding uses a
  direct Arc balance or the Circle Bridge path.
- Email delivery and legal enforceability are outside the testnet release.
- Contracts are unaudited and must not be used with production funds.
