import assert from "node:assert/strict";
import test from "node:test";
import { filterScheduledMilestones, groupMilestonesByDate } from "../lib/agreements/milestone-schedule";

const items = [
  { agreementRef: "DV-ONE", title: "Overdue", dueAt: Date.UTC(2026, 8, 1, 10), state: "pending", currentRole: "provider" as const, level: "high" as const, label: "Past due", action: "Deliver" },
  { agreementRef: "DV-TWO", title: "Soon", dueAt: Date.UTC(2026, 8, 1, 16), state: "pending", currentRole: "provider" as const, level: "medium" as const, label: "Due soon", action: "Deliver" },
  { agreementRef: "DV-THREE", title: "Later", dueAt: Date.UTC(2026, 8, 5, 12), state: "pending", currentRole: "client" as const, level: "low" as const, label: "Upcoming", action: "Review" },
];

test("milestone schedule separates attention work from upcoming work", () => {
  assert.deepEqual(filterScheduledMilestones(items, "attention").map((item) => item.title), ["Overdue", "Soon"]);
  assert.deepEqual(filterScheduledMilestones(items, "upcoming").map((item) => item.title), ["Later"]);
});

test("milestone schedule groups items that share a UTC calendar date", () => {
  const groups = groupMilestonesByDate(items);
  assert.equal(groups.length, 2);
  assert.equal(groups[0]?.items.length, 2);
});
