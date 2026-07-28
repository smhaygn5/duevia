import assert from "node:assert/strict";
import test from "node:test";
import { fundingStepStatuses } from "../lib/agreements/funding-progress";

test("funding progress follows preparation, submission, and confirmation", () => {
  assert.deepEqual(
    fundingStepStatuses({
      prepared: false,
      transactionSubmitted: false,
      confirmed: false,
    }),
    ["active", "pending", "pending"],
  );
  assert.deepEqual(
    fundingStepStatuses({
      prepared: true,
      transactionSubmitted: false,
      confirmed: false,
    }),
    ["complete", "active", "pending"],
  );
  assert.deepEqual(
    fundingStepStatuses({
      prepared: true,
      transactionSubmitted: true,
      confirmed: false,
    }),
    ["complete", "complete", "active"],
  );
  assert.deepEqual(
    fundingStepStatuses({
      prepared: false,
      transactionSubmitted: false,
      confirmed: true,
    }),
    ["complete", "complete", "complete"],
  );
});
