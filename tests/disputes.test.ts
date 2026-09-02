import assert from "node:assert/strict";
import test from "node:test";
import {
  disputeDecisionMessage,
  disputeEvidenceMessage,
  disputeOpeningMessage,
  disputeResolutionMessage,
  isFreshDisputeSignature,
  normalizeEvidenceSha256,
  normalizeEvidenceUrl,
} from "../lib/agreements/disputes";

const signer = "0x1111111111111111111111111111111111111111";
const signedAt = Date.parse("2030-01-02T03:04:05.000Z");
const disputeId = "11111111-2222-4333-8444-555555555555";

test("opening signatures bind the agreement, milestone, category and statement", () => {
  const message = disputeOpeningMessage({ agreementRef: "dv-test", category: "quality", milestonePosition: 2, signedAt, signer, statement: "The submitted files do not match the acceptance criteria." });
  assert.match(message, /Agreement: DV-TEST/);
  assert.match(message, /Milestone: 2/);
  assert.match(message, /Category: quality/);
  assert.match(message, /does not move funds/);
});

test("evidence signatures lock both HTTPS and SHA256 references", () => {
  const digest = "a".repeat(64);
  const message = disputeEvidenceMessage({ agreementRef: "DV-TEST", disputeId, evidenceSha256: digest, evidenceUrl: "https://example.com/proof", signedAt, signer, statement: "This delivery log shows the reviewed version." });
  assert.match(message, /https:\/\/example\.com\/proof/);
  assert.match(message, new RegExp(digest));
});

test("resolution and counterparty decision signatures remain separate", () => {
  const proposal = disputeResolutionMessage({ agreementRef: "DV-TEST", disputeId, note: "Complete one final revision within three working days.", resolution: "revise", signedAt, signer });
  const decision = disputeDecisionMessage({ agreementRef: "DV-TEST", decision: "accept", disputeId, proposalEventId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", proposalSignature: `0x${"ab".repeat(65)}`, signedAt, signer: "0x2222222222222222222222222222222222222222" });
  assert.match(proposal, /Resolution: revise/);
  assert.match(decision, /Decision: accept/);
  assert.match(decision, /Proposal event:/);
});

test("evidence references reject unsafe URLs and malformed digests", () => {
  assert.equal(normalizeEvidenceUrl("https://example.com/file"), "https://example.com/file");
  assert.throws(() => normalizeEvidenceUrl("http://example.com/file"), /HTTPS/);
  assert.throws(() => normalizeEvidenceUrl("https://user:secret@example.com/file"), /credentials/);
  assert.equal(normalizeEvidenceSha256("AB".repeat(32)), "ab".repeat(32));
  assert.throws(() => normalizeEvidenceSha256("abc"), /64 character/);
});

test("signed dispute actions have a bounded replay window", () => {
  assert.equal(isFreshDisputeSignature(signedAt, signedAt + 30_000), true);
  assert.equal(isFreshDisputeSignature(signedAt, signedAt + 11 * 60_000), false);
});
