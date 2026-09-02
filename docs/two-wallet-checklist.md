# Duevia two-wallet acceptance checklist

Use two testnet-only EVM wallets: one client and one provider. Never use a
wallet that holds production assets.

## Agreement and invitation

- Connect the creator wallet and sign the Duevia message.
- Create a two-milestone agreement and copy its private invitation.
- Open the invitation in a separate browser profile with the counterparty
  wallet.
- Confirm that changing wallets ends the old session and requires a fresh
  signature.
- Accept the agreement and use the in-product navigation to open it.

## Funding

Test one funding route per agreement:

- **Arc wallet:** select Arc Testnet when USDC is already in the client wallet.
- **Bridge:** select the testnet that contains regular wallet USDC and enough
  native gas.
- **Gateway balance:** use only USDC previously deposited in Circle Gateway.
  The displayed Gateway total must cover the agreement.

For Bridge or Gateway, confirm that the preparation transaction completes
before escrow deployment is offered. Then:

- deploy the isolated escrow;
- approve only the agreement amount;
- fund the escrow;
- wait for Arc confirmation;
- verify that all three progress steps become complete;
- reload the agreement and confirm the funded state remains.

If a Bridge or Gateway mint becomes resumable, use the displayed resume action
and do not start a second transfer.

## Delivery and settlement

- From the provider wallet, submit the first milestone and a small test file.
- Confirm the client can download it but an unrelated wallet cannot.
- Request one revision, resubmit, and approve the milestone.
- Verify the Arc receipt and released amount.
- Submit and approve the second milestone.
- Confirm that the agreement becomes complete and totals match the receipts.

## Recovery and navigation

- Disconnect and reconnect each wallet.
- Change to a different wallet and confirm a fresh signature is required.
- Verify Back, Home, Agreements, and Activity navigation from invitation,
  funding, submission, review, recovery, and receipt pages.
- Confirm ordinary text never displays an editable text cursor.
- Verify dark and light themes and the Duevia favicon.

Record the agreement reference and transaction hashes for the builder demo.
Do not publish the private invitation or protected files.
