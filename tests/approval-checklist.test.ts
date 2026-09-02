import assert from "node:assert/strict";
import test from "node:test";
import { isApprovalChecklistComplete } from "../lib/agreements/approval-checklist";

const checklist = [
  { id: "files", label: "Files reviewed", available: true },
  { id: "scope", label: "Scope verified", available: true },
  { id: "amount", label: "Amount confirmed", available: true },
];

test("approval requires every available checklist item", () => {
  assert.equal(isApprovalChecklistComplete(checklist, ["files", "scope"]), false);
  assert.equal(
    isApprovalChecklistComplete(checklist, ["files", "scope", "amount"]),
    true,
  );
});

test("approval remains blocked when a required item is unavailable", () => {
  assert.equal(
    isApprovalChecklistComplete(
      [...checklist, { id: "delivery", label: "Delivery present", available: false }],
      ["files", "scope", "amount", "delivery"],
    ),
    false,
  );
});
