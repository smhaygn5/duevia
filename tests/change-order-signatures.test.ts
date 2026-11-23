import assert from "node:assert/strict";
import test from "node:test";
import { verifyMessage } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { changeOrderAcceptanceMessage, changeOrderProposalMessage, isFreshChangeOrderSignature } from "../lib/agreements/change-order";

const id = "b607aa2a-c798-4f57-b3f0-3d4d4527e6ca";
const signedAt = Date.UTC(2026, 10, 24, 12);

test("a change order proposal binds its terms, identifier, and wallet", async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const message = changeOrderProposalMessage({ agreementRef: "DV-7K2P", detail: "Extend the delivery review by three working days.", id, scope: "timeline", signedAt, signer: account.address, title: "Review window extension" });
  const signature = await account.signMessage({ message });
  assert.equal(await verifyMessage({ address: account.address, message, signature }), true);
  assert.notEqual(message, changeOrderProposalMessage({ agreementRef: "DV-7K2P", detail: "Extend the delivery review by four working days.", id, scope: "timeline", signedAt, signer: account.address, title: "Review window extension" }));
});

test("an acceptance binds the exact proposal signature and the counterparty wallet", async () => {
  const proposer = privateKeyToAccount(generatePrivateKey());
  const accepter = privateKeyToAccount(generatePrivateKey());
  const proposal = changeOrderProposalMessage({ agreementRef: "DV-7K2P", detail: "Extend the delivery review by three working days.", id, scope: "timeline", signedAt, signer: proposer.address, title: "Review window extension" });
  const proposalSignature = await proposer.signMessage({ message: proposal });
  const acceptance = changeOrderAcceptanceMessage({ agreementRef: "DV-7K2P", detail: "Extend the delivery review by three working days.", id, proposalSignature, scope: "timeline", signedAt: signedAt + 1, signer: accepter.address, title: "Review window extension" });
  const acceptanceSignature = await accepter.signMessage({ message: acceptance });
  assert.equal(await verifyMessage({ address: accepter.address, message: acceptance, signature: acceptanceSignature }), true);
});

test("change order signatures have a bounded replay window", () => {
  assert.equal(isFreshChangeOrderSignature(signedAt, signedAt + 9 * 60_000), true);
  assert.equal(isFreshChangeOrderSignature(signedAt, signedAt + 11 * 60_000), false);
});
