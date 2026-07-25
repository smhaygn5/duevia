# Duevia escrow contracts

The Phase 3 contract models one client-provider agreement with sequential
USDC-funded milestones.

Implemented settlement paths:

- client funds the complete agreement once;
- provider starts and submits only the current milestone;
- client approves and releases submitted work;
- client can request revisions up to the agreed limit;
- provider can release submitted work after an unanswered review window;
- client can recover remaining funds after a missed delivery deadline;
- client can cancel before work starts;
- both parties can cancel mutually after partial completion.

Run:

```bash
npm test
npm run build
npm run typecheck
```

`DueviaEscrow.sol` is unaudited and is not approved for production funds.
