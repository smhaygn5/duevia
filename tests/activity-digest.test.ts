import assert from "node:assert/strict";
import test from "node:test";
import { agreementActivityDigest } from "../lib/agreements/activity-digest";

test("agreement activity digest separates delivery, settlement, and Arc proof records", () => {
  const digest = agreementActivityDigest([
    { type: "milestone.submitted", title: "Delivery submitted" },
    { type: "milestone.released", title: "Milestone released", txHash: "0xabc" },
    { type: "agreement.funded", title: "Agreement funded", txHash: "0xdef" },
  ]);

  assert.equal(digest.recordedEvents, 3);
  assert.equal(digest.deliveryEvents, 1);
  assert.equal(digest.settlementEvents, 2);
  assert.equal(digest.verifiedEvents, 2);
  assert.equal(digest.latestEvent, "Delivery submitted");
  assert.match(digest.summary, /1 delivery update/);
  assert.match(digest.summary, /2 Arc proofs/);
});

test("agreement activity digest has a clear empty state", () => {
  const digest = agreementActivityDigest([]);
  assert.equal(digest.latestEvent, null);
  assert.equal(digest.summary, "No agreement activity has been recorded yet.");
});
