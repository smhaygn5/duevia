import assert from "node:assert/strict";
import test from "node:test";
import { computeDashboardSummary } from "../lib/dashboard";

test("dashboard summary only counts funded, unreleased milestones as locked", () => {
  const summary = computeDashboardSummary(
    [
      { id: "active", state: "active" },
      { id: "waiting", state: "awaiting_funding" },
      { id: "done", state: "completed" },
    ],
    [
      { agreement_id: "active", state: "submitted", amount_minor: "2500000" },
      { agreement_id: "active", state: "released", amount_minor: "1000000" },
      { agreement_id: "waiting", state: "pending", amount_minor: "9000000" },
      { agreement_id: "done", state: "released", amount_minor: "2800000" },
    ],
    [{ tx_hash: "0xabc" }, { tx_hash: null }],
  );

  assert.deepEqual(summary, {
    activeAgreements: 1,
    totalAgreements: 3,
    lockedMinor: "2500000",
    releasedMinor: "3800000",
    verifiedEvents: 1,
  });
});

test("dashboard summary tolerates an invalid stored amount", () => {
  const summary = computeDashboardSummary(
    [{ id: "active", state: "active" }],
    [{ agreement_id: "active", state: "pending", amount_minor: "invalid" }],
    [],
  );

  assert.equal(summary.lockedMinor, "0");
});
