# Duevia security policy

Duevia is an unaudited Arc Testnet application. It must not be used with
mainnet assets or production funds.

## Reporting a vulnerability

Use GitHub's private security advisory flow for this repository when it is
available. Do not put wallet secrets, private invitation links, bearer tokens,
signatures, protected deliverables, or reproducible fund-loss details in a
public issue.

Include:

- the affected route, contract, or transaction flow;
- the wallet role involved (client or provider);
- the expected and observed behavior;
- a minimal reproduction that uses testnet-only accounts;
- the potential impact.

## Current safeguards

- one-time, expiring wallet sign-in challenges;
- server-side signature, session, role, and ownership checks;
- durable request limits on wallet challenge and signature endpoints;
- private D1 records and authorization-gated R2 deliverables;
- MIME signature, size, and content-hash checks for uploads;
- strict anti-framing, MIME-sniffing, referrer, and browser-permission headers;
- an ownerless factory and isolated escrow per agreement;
- verified Arc receipts before application state changes;
- explicit separation between bridge/Gateway preparation and escrow funding;
- locked dependency versions and automated application and Solidity checks.

## Production release gates

The following are mandatory before any mainnet or real-value release:

1. an independent Solidity review and professional audit;
2. static analysis, fuzzing, invariant testing, and adversarial token tests;
3. a complete two-wallet test on the intended deployment;
4. dependency review with approved disclosure to the selected advisory service;
5. production monitoring, alerting, D1 backups, and R2 retention;
6. malware scanning and a direct-to-R2 upload flow for larger deliverables;
7. reviewed legal, privacy, dispute, and incident-response policies.
