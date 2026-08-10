import assert from "node:assert/strict";
import test from "node:test";
import {
  fundingStepStatuses,
  fundingTimelineSteps,
} from "../lib/agreements/funding-progress";

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

test("live funding timeline reflects bridge and escrow confirmation separately", () => {
  const pending = fundingTimelineSteps({
    walletConfirmed: true,
    route: "bridge",
    routePrepared: true,
    routeInFlight: true,
    routeComplete: false,
    escrowInFlight: false,
    escrowFunded: false,
  });
  assert.deepEqual(
    pending.map((step) => step.status),
    ["complete", "active", "pending", "pending"],
  );

  const complete = fundingTimelineSteps({
    walletConfirmed: true,
    route: "gateway",
    routePrepared: true,
    routeInFlight: false,
    routeComplete: true,
    escrowInFlight: false,
    escrowFunded: true,
  });
  assert.deepEqual(
    complete.map((step) => step.status),
    ["complete", "complete", "complete", "complete"],
  );
});
