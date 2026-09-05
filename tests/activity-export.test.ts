import assert from "node:assert/strict";
import test from "node:test";
import { activityCsv } from "../lib/agreements/activity-export";

test("activity CSV keeps private event fields intact and escapes commas", () => {
  const csv = activityCsv([{ date: "Sep 6", agreement: "Launch, DV-1", title: "Funded", detail: "1,000 USDC locked", proof: "0xabc" }]);
  assert.match(csv, /"Launch, DV-1"/);
  assert.match(csv, /"0xabc"/);
  assert.match(csv, /^"Date","Agreement"/);
});
