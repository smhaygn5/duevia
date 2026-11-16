import assert from "node:assert/strict";
import test from "node:test";
import { deliveryPulse } from "../lib/agreements/delivery-pulse";

const now = Date.parse("2026-11-16T12:00:00.000Z");

test("shows explainable delivery progress and a near term review warning", () => {
  const pulse = deliveryPulse([
    { dueAt: Date.parse("2026-11-12T12:00:00.000Z"), position: 1, status: "released", title: "Discovery" },
    { dueAt: Date.parse("2026-11-17T12:00:00.000Z"), position: 2, status: "submitted", title: "Build" },
  ], now);
  assert.equal(pulse.completionPercent, 50);
  assert.equal(pulse.releasedStages, 1);
  assert.equal(pulse.label, "Review due soon");
  assert.equal(pulse.tone, "attention");
});

test("flags an overdue delivery and completes only after every stage settles", () => {
  const overdue = deliveryPulse([{ dueAt: Date.parse("2026-11-15T12:00:00.000Z"), position: 1, status: "pending", title: "Handoff" }], now);
  assert.equal(overdue.tone, "urgent");
  const complete = deliveryPulse([{ dueAt: null, position: 1, status: "released", title: "Handoff" }], now);
  assert.equal(complete.label, "Settlement complete");
  assert.equal(complete.completionPercent, 100);
});
