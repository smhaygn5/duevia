import assert from "node:assert/strict";
import test from "node:test";
import { settlementForecast } from "../lib/agreements/settlement-forecast";

test("settlement forecast uses the review close for submitted milestones", () => {
  const forecast = settlementForecast([
    { agreementRef: "DV-ONE", agreementTitle: "One", milestoneTitle: "Build", state: "submitted", amountMinor: "1000000", dueAt: 5_000, submittedAt: 10_000, reviewWindowSeconds: 86_400 },
    { agreementRef: "DV-TWO", agreementTitle: "Two", milestoneTitle: "Discovery", state: "pending", amountMinor: "2000000", dueAt: 20_000, reviewWindowSeconds: 86_400 },
    { agreementRef: "DV-DONE", agreementTitle: "Done", milestoneTitle: "Done", state: "released", amountMinor: "1", dueAt: 1, reviewWindowSeconds: 1 },
  ]);

  assert.equal(forecast.length, 2);
  assert.equal(forecast[0].label, "In review");
  assert.equal(forecast[0].releaseAt, 86_410_000);
  assert.equal(forecast[1].label, "Awaiting delivery");
});
