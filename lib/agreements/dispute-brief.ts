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
  statement: string;
};

export function createDisputeBrief(input: {
  agreementRef: string;
  dispute: DisputeBriefCase;
  events: DisputeBriefEvent[];
  exportedAt?: number;
}) {
  const exportedAt = input.exportedAt ?? Date.now();
  const caseLabel = titleCase(input.dispute.category);
  const scope = input.dispute.milestonePosition ? `Milestone ${input.dispute.milestonePosition}` : "Full agreement";
  const eventBlocks = input.events.length
    ? input.events.map((event, index) => [
      `## ${index + 1}. ${eventLabel(event.kind)}`,
      `- **Recorded:** ${formatUtc(event.occurredAt)}`,
      `- **Signed by:** ${titleCase(event.actorRole)}`,
      `- **Signature:** \`${event.signature}\``,
      event.resolutionType ? `- **Resolution:** ${titleCase(event.resolutionType)}` : null,
      event.evidenceUrl ? `- **Evidence URL:** ${event.evidenceUrl}` : null,
      event.evidenceSha256 ? `- **Evidence SHA256:** \`${event.evidenceSha256}\`` : null,
      "",
      event.statement,
    ].filter((value): value is string => value !== null).join("\n")).join("\n\n")
    : "No signed events are available for this case yet.";

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
    "",
    "> This brief preserves the wallet-signed coordination record. It is not an onchain ruling and does not release, refund, or move USDC.",
    "",
    "# Signed record",
    "",
    eventBlocks,
    "",
  ].join("\n");
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
