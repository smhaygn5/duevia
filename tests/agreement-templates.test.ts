import assert from "node:assert/strict";
import test from "node:test";
import { agreementInputSchema } from "../lib/agreements/validation";
import { agreementTemplates } from "../lib/agreements/templates";

test("agreement templates use future sequential dates", () => {
  const now = new Date("2030-10-30T12:00:00.000Z");
  for (const template of agreementTemplates(now)) {
    const dates = template.milestones.map((milestone) => Date.parse(`${milestone.dueDate}T12:00:00.000Z`));
    assert.ok(dates.every((date) => date > now.getTime()));
    assert.ok(dates.every((date, index) => index === 0 || date > dates[index - 1]));
  }
});

test("agreement templates provide valid editable agreement structure", () => {
  const template = agreementTemplates(new Date("2030-10-30T12:00:00.000Z"))[0];
  const result = agreementInputSchema.safeParse({
    title: template.agreementTitle,
    creatorRole: "provider",
    counterpartyName: "Example client",
    milestones: template.milestones.map((milestone, index) => ({
      ...milestone,
      amount: String(index + 1),
      acceptanceChecklist: milestone.acceptanceChecklist ?? [milestone.description],
    })),
  });
  assert.equal(result.success, true);
});
