import assert from "node:assert/strict";
import test from "node:test";
import { sortActionCenterItems } from "../lib/agreements/action-center";

test("action center puts approval work before deadline reminders", () => {
  const items = sortActionCenterItems([
    { id: "deadline", type: "deadline", agreementRef: "DV-1", title: "Due soon", detail: "", occurredAt: 300, href: "/" },
    { id: "review-old", type: "review", agreementRef: "DV-2", title: "Review", detail: "", occurredAt: 100, href: "/" },
    { id: "revision", type: "revision", agreementRef: "DV-3", title: "Revision", detail: "", occurredAt: 200, href: "/" },
    { id: "review-new", type: "review", agreementRef: "DV-4", title: "Review", detail: "", occurredAt: 400, href: "/" },
  ]);
  assert.deepEqual(items.map((item) => item.id), ["review-new", "review-old", "revision", "deadline"]);
});
