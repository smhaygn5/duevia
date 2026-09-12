import assert from "node:assert/strict";
import test from "node:test";
import { filterScheduledMilestones, filterScheduleWindow, groupMilestonesByDate } from "../lib/agreements/milestone-schedule";

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

test("milestone schedule separates the next two seven-day windows", () => {
  const now = Date.UTC(2026, 8, 1, 12);
  const scheduled = [
    { ...items[0]!, dueAt: now - 1 },
    { ...items[1]!, dueAt: now + 6 * 24 * 60 * 60 * 1_000 },
    { ...items[2]!, dueAt: now + 10 * 24 * 60 * 60 * 1_000 },
    { ...items[2]!, title: "Much later", dueAt: now + 15 * 24 * 60 * 60 * 1_000 },
  ];
  assert.equal(filterScheduleWindow(scheduled, "next", now).length, 2);
  assert.equal(filterScheduleWindow(scheduled, "following", now).map((item) => item.title).join(","), "Later");
  assert.equal(filterScheduleWindow(scheduled, "later", now).map((item) => item.title).join(","), "Much later");
});
