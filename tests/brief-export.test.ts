import assert from "node:assert/strict";
import test from "node:test";
import { agreementBriefFilename, agreementBriefText } from "../lib/agreements/brief-export";

const brief = {
  counterparty: "Northstar Labs",
  generatedAt: "2026-11-15T00:00:00.000Z",
  milestones: [{ amount: "250", due: "Nov 20, 2026", position: 1, status: "Submitted", title: "Discovery" }],
  nextStep: "Client review",
  publicRef: "DV-TEST1",
  released: "0",
  status: "Funded",
  title: "Global Launch",
  total: "250",
};

test("creates a readable agreement handoff brief", () => {
  const exported = agreementBriefText(brief);
  assert.match(exported, /Agreement: DV-TEST1/);
  assert.match(exported, /01\. Discovery · 250 USDC · Submitted/);
  assert.match(exported, /Next step: Client review/);
  assert.match(exported, /Arc Explorer/);
});

test("uses a safe deterministic agreement brief filename", () => {
  assert.equal(agreementBriefFilename(brief), "duevia-global-launch-dv-test1-brief.md");
});
