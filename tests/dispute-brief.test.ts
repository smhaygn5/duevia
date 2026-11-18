import assert from "node:assert/strict";
import test from "node:test";
import { createDisputeBrief, disputeBriefFilename } from "../lib/agreements/dispute-brief";

test("creates a portable dispute brief with signed evidence", () => {
  const brief = createDisputeBrief({
    agreementRef: "dv-7k2p",
    exportedAt: Date.UTC(2026, 10, 18, 8, 0),
    dispute: {
      category: "delivery",
      id: "b607aa2a-c798-4f57-b3f0-3d4d4527e6ca",
      milestonePosition: 2,
      openedAt: Date.UTC(2026, 10, 17, 9, 30),
      openedByRole: "client",
      status: "resolution_pending",
    },
    events: [{
      actorRole: "provider",
      evidenceSha256: "a".repeat(64),
      evidenceUrl: "https://example.com/evidence",
      kind: "evidence",
      occurredAt: Date.UTC(2026, 10, 17, 10, 0),
      resolutionType: null,
      signature: "0xabc123",
      statement: "The revised delivery is attached for review.",
    }],
  });

  assert.match(brief, /Agreement:\*\* DV-7K2P/);
  assert.match(brief, /Scope:\*\* Milestone 2/);
  assert.match(brief, /Evidence SHA256/);
  assert.match(brief, /not an onchain ruling/i);
});

test("uses a safe, deterministic dispute brief filename", () => {
  assert.equal(disputeBriefFilename("DV-7K2P", "b607aa2a-c798-4f57-b3f0-3d4d4527e6ca"), "dv-7k2p-dispute-b607aa2a-c798-4f57-b3f0-3d4d4527e6ca.md");
});
