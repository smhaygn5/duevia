import assert from "node:assert/strict";
import test from "node:test";
import { deadlineAlerts } from "../lib/agreements/deadline-alerts";

const risks = [
  { action: "Review delivery", agreementRef: "DV-1", currentRole: "client" as const, dueAt: 1, label: "Past due", level: "high" as const, state: "submitted", title: "Build" },
  { action: "Prepare delivery", agreementRef: "DV-2", currentRole: "provider" as const, dueAt: 2, label: "Upcoming", level: "low" as const, state: "pending", title: "Handoff" },
];

test("only surfaces attention deadlines for important browser alerts", () => {
  assert.deepEqual(deadlineAlerts(risks, "important").map((alert) => alert.title), ["Past due: Build"]);
  assert.equal(deadlineAlerts(risks, "all").length, 2);
  assert.equal(deadlineAlerts(risks, "none").length, 0);
});
