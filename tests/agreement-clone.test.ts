import assert from "node:assert/strict";
import test from "node:test";
import { cloneMilestoneSchedule } from "../lib/agreements/clone";

test("cloned milestones retain their cadence and start in the future", () => {
  const now = new Date("2026-11-01T09:00:00.000Z");
  const result = cloneMilestoneSchedule(
    [
      { title: "Scope", description: "Agree the project scope.", amount: "100", dueAt: Date.parse("2026-08-02T12:00:00.000Z"), reviewDays: 3, revisionLimit: 1 },
      { title: "Delivery", description: "Deliver the accepted work.", amount: "200", dueAt: Date.parse("2026-08-16T12:00:00.000Z"), reviewDays: 5, revisionLimit: 2 },
    ],
    now,
  );

  assert.deepEqual(result.map((milestone) => milestone.dueDate), ["2026-11-08", "2026-11-22"]);
  assert.equal(result[1]?.amount, "200");
  assert.equal(result[1]?.reviewDays, 5);
});
