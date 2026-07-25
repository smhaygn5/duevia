import assert from "node:assert/strict";
import test from "node:test";
import { agreementInputSchema } from "../lib/agreements/validation";

const validAgreement = {
  title: "Global product launch",
  creatorRole: "provider" as const,
  counterpartyName: "Northstar Labs",
  counterpartyEmail: "ops@northstar.example",
  milestones: [
    {
      title: "Discovery",
      description: "Research, scope, and an approved delivery roadmap.",
      amount: "1000",
      dueDate: "2099-08-05",
      reviewDays: 3,
      revisionLimit: 1,
    },
    {
      title: "Product build",
      description: "Responsive implementation and a complete handoff package.",
      amount: "2500.125",
      dueDate: "2099-08-19",
      reviewDays: 3,
      revisionLimit: 1,
    },
  ],
};

test("accepts a global milestone agreement with six-decimal USDC amounts", () => {
  const result = agreementInputSchema.safeParse(validAgreement);
  assert.equal(result.success, true);
});

test("rejects unordered milestones and over-precise USDC amounts", () => {
  const result = agreementInputSchema.safeParse({
    ...validAgreement,
    milestones: [
      validAgreement.milestones[1],
      {
        ...validAgreement.milestones[0],
        amount: "1.0000001",
      },
    ],
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.match(
      result.error.issues.map((issue) => issue.message).join(" "),
      /sequential|valid USDC amount/i,
    );
  }
});
