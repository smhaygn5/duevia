import assert from "node:assert/strict";
import test from "node:test";
import { assessAgreementHealth } from "../lib/agreements/agreement-health";

test("agreement health remains explainably healthy without deadline pressure", () => {
  const health = assessAgreementHealth({
    activeAgreements: 2,
    deadlineRisks: [{ level: "low" }],
    settlementForecast: [{ label: "In review" }],
  });

  assert.equal(health.level, "healthy");
  assert.equal(health.score, 97);
  assert.match(health.detail, /No overdue/);
});

test("agreement health prioritizes overdue work over all other signals", () => {
  const health = assessAgreementHealth({
    activeAgreements: 1,
    deadlineRisks: [{ level: "high" }, { level: "medium" }],
    settlementForecast: [{ label: "Awaiting delivery" }],
  });

  assert.equal(health.level, "urgent");
  assert.equal(health.score, 51);
  assert.equal(health.signals[0]?.label, "1 past due");
});
