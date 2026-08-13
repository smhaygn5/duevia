import assert from "node:assert/strict";
import test from "node:test";
import { assessDeadlineRisk, deadlineRisks } from "../lib/agreements/deadline-risk";

const now = Date.UTC(2026, 7, 14, 12);
const base = { state: "in_progress", title: "Delivery", agreementRef: "DV-TEST", currentRole: "provider" as const };

test("deadline risk distinguishes overdue, near, and upcoming work", () => {
  assert.equal(assessDeadlineRisk({ ...base, dueAt: now - 1 }, now)?.level, "high");
  assert.equal(assessDeadlineRisk({ ...base, dueAt: now + 24 * 60 * 60 * 1_000 }, now)?.level, "medium");
  assert.equal(assessDeadlineRisk({ ...base, dueAt: now + 5 * 24 * 60 * 60 * 1_000 }, now)?.level, "low");
});

test("deadline risk excludes settled milestones and sorts active work", () => {
  const risks = deadlineRisks([{ ...base, title: "Later", dueAt: now + 4_000 }, { ...base, title: "First", dueAt: now + 1_000 }, { ...base, state: "released", title: "Settled", dueAt: now - 1 }], now);
  assert.deepEqual(risks.map((risk) => risk.title), ["First", "Later"]);
});
