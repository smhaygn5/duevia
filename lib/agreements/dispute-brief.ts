export type DisputeBriefCase = {
  category: string;
  id: string;
  milestonePosition: number | null;
  openedAt: number;
  openedByRole: "client" | "provider";
  status: "open" | "resolution_pending" | "resolved";
};

export type DisputeBriefEvent = {
  actorRole: "client" | "provider";
  evidenceSha256: string | null;
  evidenceUrl: string | null;
  kind: "opened" | "evidence" | "resolution_proposed" | "resolution_accepted" | "resolution_rejected";
  occurredAt: number;
  resolutionType: string | null;
  signature: string;
  /** Wallet that signed the event. Null only for records that never stored it. */
  signerAddress?: string | null;
  /** Exact text the wallet signed. Null for legacy records created before it was stored. */
  signedMessage?: string | null;
  statement: string;
};

const LEGACY_NOTICE =
  "Legacy record: independently verifiable message unavailable. The exact signed message was not stored when this event was recorded, so this export cannot be used to verify the signature on its own.";

/**
 * User-written text is never emitted as raw Markdown. It always goes inside a
 * fenced block whose fence is longer than any backtick run in the text, so
 * headings, lists, or fake "Signed by" lines cannot become document structure.
 */
export function safeTextBlock(value: string) {
  const text = value.replace(/\r\n?/g, "\n").replaceAll("\0", "");
  const longestRun = (text.match(/`+/g) ?? []).reduce((longest, run) => Math.max(longest, run.length), 0);
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return [`${fence}text`, text, fence].join("\n");
}

/** Single line values (URLs, addresses) rendered as inline code that cannot be broken out of. */
function inlineCode(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  const longestRun = (text.match(/`+/g) ?? []).reduce((longest, run) => Math.max(longest, run.length), 0);
  const ticks = "`".repeat(longestRun + 1);
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${ticks}${pad}${text}${pad}${ticks}`;
}

export function createDisputeBrief(input: {
  agreementRef: string;
  dispute: DisputeBriefCase;
  events: DisputeBriefEvent[];
  exportedAt?: number;
}) {
  const exportedAt = input.exportedAt ?? Date.now();
  const caseLabel = titleCase(input.dispute.category);
  const scope = input.dispute.milestonePosition ? `Milestone ${input.dispute.milestonePosition}` : "Full agreement";
  const verifiable = input.events.filter(isIndependentlyVerifiable).length;
  const legacy = input.events.length - verifiable;
  const eventBlocks = input.events.length
    ? input.events.map((event, index) => eventBlock(event, index)).join("\n\n")
    : "No events are available for this case yet.";

  return [
    "# Duevia dispute brief",
    "",
    `**Agreement:** ${input.agreementRef.toUpperCase()}`,
    `**Case ID:** ${input.dispute.id}`,
    `**Category:** ${caseLabel}`,
    `**Scope:** ${scope}`,
    `**Opened by:** ${titleCase(input.dispute.openedByRole)}`,
    `**Opened:** ${formatUtc(input.dispute.openedAt)}`,
    `**Status:** ${titleCase(input.dispute.status)}`,
    `**Exported:** ${formatUtc(exportedAt)}`,
    `**Events:** ${input.events.length} (${verifiable} independently verifiable, ${legacy} legacy)`,
    "",
    "> This brief preserves the Duevia workspace record. It is not an onchain ruling and does not release, refund, or move USDC.",
    legacy === 0
      ? "> Every event below includes the signer wallet, the exact signed message, and the signature, so each can be verified without Duevia."
      : "> Events marked as legacy records do not include the exact signed message and cannot be verified from this document alone.",
    "> All text written by the parties is shown inside code blocks and is quoted verbatim. It is never part of this document's structure.",
    "",
    "# Event record",
    "",
    eventBlocks,
    "",
    "# How to verify",
    "",
    "For each event, check the signature against the signer wallet and the exact signed message with any EIP-191 personal message verifier (for example `verifyMessage` in viem). Smart contract wallets use ERC-1271 verification.",
    "",
  ].join("\n");
}

function isIndependentlyVerifiable(event: DisputeBriefEvent) {
  return Boolean(event.signedMessage && event.signerAddress && event.signature);
}

function eventBlock(event: DisputeBriefEvent, index: number) {
  const verifiable = isIndependentlyVerifiable(event);
  const lines: Array<string | null> = [
    `## ${index + 1}. ${eventLabel(event.kind)}`,
    `- **Recorded:** ${formatUtc(event.occurredAt)}`,
    `- **Role:** ${titleCase(event.actorRole)}`,
    event.signerAddress ? `- **${verifiable ? "Signer wallet" : "Recorded wallet (unverified)"}:** ${inlineCode(event.signerAddress)}` : null,
    verifiable ? `- **Signed at:** ${formatUtc(event.occurredAt)}` : null,
    `- **Signature:** ${inlineCode(event.signature)}`,
    event.resolutionType ? `- **Resolution:** ${titleCase(event.resolutionType)}` : null,
    event.evidenceUrl ? `- **Evidence URL (as submitted):** ${inlineCode(event.evidenceUrl)}` : null,
    event.evidenceSha256 ? `- **Evidence SHA256:** ${inlineCode(event.evidenceSha256)}` : null,
    "",
    "Statement (quoted verbatim):",
    "",
    safeTextBlock(event.statement),
    "",
    verifiable ? "Signed message (exact text the wallet signed):" : `**${LEGACY_NOTICE}**`,
  ];
  if (verifiable) lines.push("", safeTextBlock(event.signedMessage ?? ""));
  return lines.filter((value): value is string => value !== null).join("\n");
}

export function disputeBriefFilename(agreementRef: string, disputeId: string) {
  const safeAgreement = agreementRef.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const safeCase = disputeId.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return `${safeAgreement || "agreement"}-dispute-${safeCase || "record"}.md`;
}

function eventLabel(kind: DisputeBriefEvent["kind"]) {
  return titleCase(kind);
}

function titleCase(value: string) {
  return value.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function formatUtc(value: number) {
  return new Date(value).toISOString().replace(".000Z", "Z");
}
