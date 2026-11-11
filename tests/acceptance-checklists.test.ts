import assert from "node:assert/strict";
import test from "node:test";
import { checklistForPreset } from "../lib/agreements/acceptance-checklists";

test("reusable acceptance checklists provide reviewable criteria", () => {
  const items = checklistForPreset("handoff");
  assert.equal(items.length, 3);
  assert.ok(items.every((item) => item.length >= 3));
  assert.deepEqual(checklistForPreset("unknown"), []);
});
