import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAgreementTransition,
  assertMilestoneTransition,
  canTransitionAgreement,
  canTransitionMilestone,
} from "../lib/domain/agreement-state";

test("agreement terminal states cannot move", () => {
  for (const state of ["completed", "cancelled", "refunded"] as const) {
    assert.equal(canTransitionAgreement(state, "active"), false);
  }
});

test("active agreements expose completion and exit paths", () => {
  assert.equal(canTransitionAgreement("active", "completed"), true);
  assert.equal(canTransitionAgreement("active", "cancelled"), true);
  assert.equal(canTransitionAgreement("active", "refunded"), true);
});

test("a submitted milestone can only return for changes or release", () => {
  assert.equal(canTransitionMilestone("submitted", "changes_requested"), true);
  assert.equal(canTransitionMilestone("submitted", "released"), true);
  assert.equal(canTransitionMilestone("submitted", "refunded"), false);
});

test("invalid state changes fail loudly", () => {
  assert.throws(
    () => assertAgreementTransition("completed", "active"),
    /Invalid agreement transition/,
  );
  assert.throws(
    () => assertMilestoneTransition("released", "submitted"),
    /Invalid milestone transition/,
  );
});
