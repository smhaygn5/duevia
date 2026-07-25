# Duevia Phase 4 product

Duevia now supports a connected global milestone workflow:

1. A client or provider connects an EVM wallet, switches to Arc Testnet, and
   signs a gasless, expiring ownership challenge.
2. The creator prepares one to eight sequential USDC milestones and receives a
   private invitation URL.
3. The counterparty signs in with a different wallet and accepts the same
   agreement record.
4. Funding preparation can use a direct Arc balance, a Circle App Kit Bridge
   estimate, or Circle Unified Balance discovery.
5. The provider uploads protected deliverables. Duevia validates the declared
   media type against file bytes, stores the object in R2, and records a raw
   SHA-256 proof in D1.
6. The client reviews acceptance criteria, requests a bounded revision, or
   confirms an exact milestone release.
7. A receipt and activity ledger expose the human-readable result and Arc
   explorer proof.
8. Cancellation and recovery screens show mutual cancellation, pre-work exit,
   and deadline recovery as separate condition-based paths.

The demo agreement `DV-7K2P` connects every decision screen without moving
funds. Non-demo onchain funding, submission, release, and refund execution are
intentionally locked until an audited escrow address is configured.

## Product routes

- `/` — global landing page
- `/app` — workspace dashboard
- `/app/agreements` — searchable agreement list
- `/app/agreements/new` — agreement and milestone builder
- `/invite/:token` — private counterparty decision
- `/app/agreements/:ref` — agreement detail and activity
- `/app/agreements/:ref/fund` — Bridge / Unified Balance funding preparation
- `/app/agreements/:ref/submit` — protected deliverable submission
- `/app/agreements/:ref/review` — approve or request changes
- `/app/agreements/:ref/recovery` — cancellation and timeout paths
- `/app/receipts/:id` — settlement receipt
- `/app/activity` — filterable audit trail
- `/app/settings` — workspace and notification preferences

## Safety boundaries

- Wallet sign-in signatures cannot move funds.
- Session tokens are opaque, hashed in D1, HttpOnly, SameSite=Lax, and
  time-limited.
- Invitation tokens are only stored as hashes.
- Deliverables are private, access-checked, `no-store`, and `nosniff`.
- Uploaded draft deletion removes the exact R2 object and D1 record.
- Real value movement is not simulated as success; execution remains disabled
  without the escrow address.
