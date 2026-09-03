import assert from "node:assert/strict";
import test from "node:test";
import { reviewWindow } from "../lib/agreements/review-window";

const now = Date.UTC(2026, 8, 3, 12, 0, 0);

test("review window explains open, closing, and expired states", () => {
  assert.equal(reviewWindow(now, 3 * 24 * 60 * 60, now).state, "open");
  assert.equal(reviewWindow(now, 12 * 60 * 60, now).state, "closing");
  assert.equal(reviewWindow(now - 24 * 60 * 60 * 1_000, 12 * 60 * 60, now).state, "expired");
});

test("review window formats a human readable remaining time", () => {
  const window = reviewWindow(now, 2 * 24 * 60 * 60 + 3 * 60 * 60, now);
  assert.equal(window.label, "2d 3h remaining");
});
