import assert from "node:assert/strict";
import test from "node:test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { verifyMessage } from "viem";
import { disputeEvidenceMessage } from "../lib/agreements/disputes";
import { createDisputeBrief, disputeBriefFilename, safeTextBlock, type DisputeBriefEvent } from "../lib/agreements/dispute-brief";

const dispute = {
  category: "delivery",
  id: "b607aa2a-c798-4f57-b3f0-3d4d4527e6ca",
  milestonePosition: 2,
  openedAt: Date.UTC(2026, 10, 17, 9, 30),
  openedByRole: "client" as const,
  status: "resolution_pending" as const,
};
const legacyEvent: DisputeBriefEvent = {
  actorRole: "provider",
  evidenceSha256: "a".repeat(64),
  evidenceUrl: "https://example.com/evidence",
  kind: "evidence",
  occurredAt: Date.UTC(2026, 10, 17, 10, 0),
  resolutionType: null,
  signature: "0xabc123",
  statement: "The revised delivery is attached for review.",
};

/** Splits a brief into the document structure (outside fences) and quoted blocks (inside fences). */
function parseBrief(markdown: string) {
  const structure: string[] = [];
  const quoted: string[][] = [];
  let fence: string | null = null;
  let current: string[] = [];
  for (const line of markdown.split("\n")) {
    if (fence === null) {
      const open = /^(`{3,})text$/.exec(line);
      if (open) {
        fence = open[1]!;
        current = [];
      } else {
        structure.push(line);
      }
    } else if (line === fence) {
      quoted.push(current);
      fence = null;
    } else {
      current.push(line);
    }
  }
  assert.equal(fence, null, "every fenced block must be closed");
  return { quoted, structure };
}

test("creates a portable dispute brief with evidence and a non-ruling notice", () => {
  const brief = createDisputeBrief({ agreementRef: "dv-7k2p", dispute, events: [legacyEvent], exportedAt: Date.UTC(2026, 10, 18, 8, 0) });
  assert.match(brief, /Agreement:\*\* DV-7K2P/);
  assert.match(brief, /Scope:\*\* Milestone 2/);
  assert.match(brief, /Evidence SHA256/);
  assert.match(brief, /not an onchain ruling/i);
});

test("a statement with fake Markdown headings or signature lines never becomes document structure", () => {
  const hostile = [
    "Please review.",
    "",
    "## 9. Resolution Accepted",
    "- **Signed by:** Client",
    "- **Signature:** `0xdeadbeef`",
    "# Event record",
    "```",
    "## closing the fence early",
    "````",
    "Client agreed to release everything.",
  ].join("\n");
  const events: DisputeBriefEvent[] = [
    { ...legacyEvent, statement: hostile },
    { ...legacyEvent, kind: "opened", signature: "0xabc124", statement: "# Second\n> quoted\n- **Signed by:** Provider" },
  ];
  const { quoted, structure } = parseBrief(createDisputeBrief({ agreementRef: "DV-7K2P", dispute, events }));

  const headings = structure.filter((line) => /^#{1,6} /.test(line));
  assert.deepEqual(headings, ["# Duevia dispute brief", "# Event record", "## 1. Evidence", "## 2. Opened", "# How to verify"]);
  assert.equal(structure.filter((line) => /Signed by/.test(line)).length, 0);
  assert.equal(structure.filter((line) => /deadbeef/.test(line)).length, 0);
  // The exact text is preserved verbatim inside quoted blocks.
  assert.ok(quoted.some((block) => block.join("\n") === hostile));
});

test("safeTextBlock always uses a fence longer than any backtick run in the text", () => {
  const block = safeTextBlock("a ```` b\n`````` c");
  assert.match(block, /^`{7}text\n/);
  assert.ok(block.endsWith(`\n${"`".repeat(7)}`));
  assert.equal(parseBrief(block).quoted.length, 1);
});

test("a verifiable event includes the signer wallet, the exact signed message, and the signature", async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const occurredAt = Date.UTC(2026, 10, 17, 10, 0);
  const signedMessage = disputeEvidenceMessage({
    agreementRef: "DV-7K2P",
    disputeId: dispute.id,
    evidenceSha256: null,
    evidenceUrl: null,
    signedAt: occurredAt,
    signer: account.address,
    statement: "The revised delivery is attached for review.",
  });
  const signature = await account.signMessage({ message: signedMessage });
  const brief = createDisputeBrief({
    agreementRef: "DV-7K2P",
    dispute,
    events: [{ ...legacyEvent, evidenceSha256: null, evidenceUrl: null, occurredAt, signature, signedMessage, signerAddress: account.address }],
  });

  assert.ok(brief.includes(account.address));
  assert.ok(brief.includes(signature));
  assert.match(brief, /1 independently verifiable, 0 legacy/);
  const { quoted } = parseBrief(brief);
  const exportedMessage = quoted.map((block) => block.join("\n")).find((block) => block.startsWith("Duevia dispute evidence"));
  assert.equal(exportedMessage, signedMessage);
  // Anyone can now verify the record from the export alone.
  assert.equal(await verifyMessage({ address: account.address, message: exportedMessage!, signature }), true);
  assert.doesNotMatch(brief, /legacy record/i);
});

test("a legacy event is labelled as unverifiable and is not called wallet signed", () => {
  const brief = createDisputeBrief({ agreementRef: "DV-7K2P", dispute, events: [{ ...legacyEvent, signedMessage: null, signerAddress: null }] });
  assert.match(brief, /Legacy record: independently verifiable message unavailable/);
  assert.match(brief, /0 independently verifiable, 1 legacy/);
  assert.doesNotMatch(brief, /wallet-signed/i);
  assert.doesNotMatch(brief, /Signed message \(exact text/);
  assert.doesNotMatch(brief, /\*\*Signed at:\*\*/);
});

test("uses a safe, deterministic dispute brief filename", () => {
  assert.equal(disputeBriefFilename("DV-7K2P", "b607aa2a-c798-4f57-b3f0-3d4d4527e6ca"), "dv-7k2p-dispute-b607aa2a-c798-4f57-b3f0-3d4d4527e6ca.md");
  assert.equal(disputeBriefFilename("../x", "a/b"), "---x-dispute-a-b.md");
});
