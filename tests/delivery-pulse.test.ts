import assert from "node:assert/strict";
import test from "node:test";
import { deliveryPulse } from "../lib/agreements/delivery-pulse";

const now = Date.parse("2026-11-16T12:00:00.000Z");

test("shows explainable delivery progress and a near term review warning", () => {
  const pulse = deliveryPulse([
    { dueAt: Date.parse("2026-11-12T12:00:00.000Z"), position: 1, status: "released", title: "Discovery" },
    {
      dueAt: Date.parse("2026-11-14T12:00:00.000Z"),
      position: 2,
      reviewWindowSeconds: 3 * 86_400,
      status: "submitted",
      submittedAt: Date.parse("2026-11-14T12:00:00.000Z"),
      title: "Build",
    },
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

const hour = 3_600_000;
const day = 24 * hour;

test("a milestone delivered on time is not overdue while its review window is still open", () => {
  // The delivery due date passed three days ago, but the work was submitted an hour ago
  // and the client still has three days to review it.
  const pulse = deliveryPulse([{
    dueAt: now - 3 * day,
    position: 1,
    reviewWindowSeconds: 3 * 86_400,
    status: "submitted",
    submittedAt: now - hour,
    title: "Build",
  }], now);
  assert.equal(pulse.label, "Review on track");
  assert.equal(pulse.tone, "healthy");
  assert.doesNotMatch(pulse.label, /overdue/i);
  assert.doesNotMatch(pulse.detail, /past its due date/i);
});

test("a submitted milestone becomes overdue only after submittedAt plus the review window", () => {
  const input = { dueAt: now - 10 * day, position: 1, reviewWindowSeconds: 3 * 86_400, status: "submitted", title: "Build" };
  assert.equal(deliveryPulse([{ ...input, submittedAt: now - 3 * day + hour }], now).tone, "attention");
  const closed = deliveryPulse([{ ...input, submittedAt: now - 3 * day - hour }], now);
  assert.equal(closed.label, "Review overdue");
  assert.equal(closed.tone, "urgent");
});

test("a submitted milestone without review timing is never reported as overdue", () => {
  const pulse = deliveryPulse([{ dueAt: now - 30 * day, position: 1, status: "submitted", title: "Build" }], now);
  assert.equal(pulse.label, "Review in progress");
  assert.equal(pulse.tone, "healthy");
});

test("unsubmitted work still uses its delivery due date", () => {
  const pulse = deliveryPulse([{ dueAt: now - hour, position: 1, reviewWindowSeconds: 86_400, status: "in_progress", title: "Build" }], now);
  assert.equal(pulse.label, "Delivery overdue");
});
