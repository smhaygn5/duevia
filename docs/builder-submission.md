# Duevia Builder submission

## One-line pitch

Duevia is a global milestone agreement, protected delivery, USDC escrow, and
settlement workspace built on Arc.

## The user problem

Clients fear paying before usable work arrives. Service providers fear delayed
or disputed payment after delivery. Existing workflows separate scope,
deliverables, invoices, and settlement, leaving both parties with weak shared
evidence.

## The product

Duevia lets either party prepare sequential milestone terms. The counterparty
accepts with a wallet, the client funds one isolated Arc escrow, the provider
submits protected work, and the client releases USDC one stage at a time.
Every settlement result is connected to an Arc receipt and a human-readable
activity trail.

## Why it belongs on Arc

- USDC is both the unit of account and settlement asset.
- Circle App Kit brings supported testnet USDC into Arc before funding.
- Fast, explicit Arc confirmations make agreement state understandable.
- Onchain conditions replace Duevia custody for release and recovery.

## What works

- signed wallet sessions and private invitations
- D1 agreements, milestones, activities, and receipts
- protected R2 deliverable uploads and downloads
- ownerless escrow factory and isolated agreement escrows
- direct Arc and Circle Bridge funding preparation
- provider submission proofs
- client revisions and milestone releases
- cancellation and deadline recovery paths
- connected public demo with clear no-value disclosure

## Security posture

The contracts have no admin withdrawal path. Parties and milestone terms are
immutable, only the client can deploy and fund, only the provider can submit,
and only the client can request changes or release. Duevia verifies successful
receipts, signing wallet, expected contract, and all accepted terms before
updating application state.

This is an unaudited Arc Testnet release and is not intended for production
funds.

## Links

- Live product: `https://duevia-arc-testnet.celiluyanikoglu.chatgpt.site`
- Arc explorer:
  `https://testnet.arcscan.app/address/0x8097847f00e47Da0Bc6628A3e500215AAeE1fFad`
- Deployment transaction:
  `https://testnet.arcscan.app/tx/0x1759dd334012c32d69f852ef56c8424ed8cd16679c72c24db081ccd07e728215`
- Repository: add the public repository URL when published
