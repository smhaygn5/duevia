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

test("submitted work is judged by its review window, not its delivery due date", () => {
  const submitted = { ...base, state: "submitted", currentRole: "client" as const, dueAt: now - 5 * 24 * 60 * 60 * 1_000 };
  const open = assessDeadlineRisk({ ...submitted, reviewClosesAt: now + 3 * 24 * 60 * 60 * 1_000 }, now);
  assert.equal(open?.level, "low");
  assert.notEqual(open?.label, "Past due");
  const closing = assessDeadlineRisk({ ...submitted, reviewClosesAt: now + 60 * 60 * 1_000 }, now);
  assert.equal(closing?.level, "medium");
  const closed = assessDeadlineRisk({ ...submitted, reviewClosesAt: now - 1 }, now);
  assert.equal(closed?.level, "high");
  assert.equal(closed?.label, "Review window closed");
  const unknown = assessDeadlineRisk(submitted, now);
  assert.equal(unknown?.level, "low");
  assert.notEqual(unknown?.label, "Past due");
});
