import { getAddress, isAddress } from "viem";

export const DISPUTE_CATEGORIES = [
  "scope",
  "delivery",
  "quality",
  "deadline",
  "payment",
  "other",
] as const;

export const DISPUTE_RESOLUTIONS = [
  "continue",
  "revise",
  "cancel",
  "refund_remaining",
  "release_current",
] as const;

export type DisputeCategory = (typeof DISPUTE_CATEGORIES)[number];
export type DisputeResolution = (typeof DISPUTE_RESOLUTIONS)[number];
export type DisputeStatus = "open" | "resolution_pending" | "resolved";

type SignatureBase = {
  agreementRef: string;
  signedAt: number;
  signer: string;
};

export function disputeOpeningMessage(input: SignatureBase & {
  category: DisputeCategory;
  milestonePosition: number | null;
  statement: string;
}) {
  return message([
    "Duevia dispute opening",
    `Agreement: ${normalizeAgreementRef(input.agreementRef)}`,
    `Milestone: ${input.milestonePosition ?? "Agreement level"}`,
    `Category: ${input.category}`,
    `Statement: ${normalizeDisputeStatement(input.statement, 20)}`,
    `Signer: ${normalizeSigner(input.signer)}`,
    `Signed at: ${normalizeSignedAt(input.signedAt)}`,
  ]);
}

export function disputeEvidenceMessage(input: SignatureBase & {
  disputeId: string;
  evidenceSha256?: string | null;
  evidenceUrl?: string | null;
  statement: string;
}) {
  return message([
    "Duevia dispute evidence",
    `Agreement: ${normalizeAgreementRef(input.agreementRef)}`,
    `Dispute: ${normalizeId(input.disputeId)}`,
    `Statement: ${normalizeDisputeStatement(input.statement, 8)}`,
    `Evidence URL: ${normalizeEvidenceUrl(input.evidenceUrl) ?? "None"}`,
    `Evidence SHA256: ${normalizeEvidenceSha256(input.evidenceSha256) ?? "None"}`,
    `Signer: ${normalizeSigner(input.signer)}`,
    `Signed at: ${normalizeSignedAt(input.signedAt)}`,
  ]);
}

export function disputeResolutionMessage(input: SignatureBase & {
  disputeId: string;
  note: string;
  resolution: DisputeResolution;
}) {
  return message([
    "Duevia dispute resolution proposal",
    `Agreement: ${normalizeAgreementRef(input.agreementRef)}`,
    `Dispute: ${normalizeId(input.disputeId)}`,
    `Resolution: ${input.resolution}`,
    `Note: ${normalizeDisputeStatement(input.note, 12)}`,
    `Signer: ${normalizeSigner(input.signer)}`,
    `Signed at: ${normalizeSignedAt(input.signedAt)}`,
  ]);
}

export function disputeDecisionMessage(input: SignatureBase & {
  decision: "accept" | "reject";
  disputeId: string;
  note?: string | null;
  proposalEventId: string;
  proposalSignature: string;
}) {
  const note = input.decision === "reject"
    ? normalizeDisputeStatement(input.note ?? "", 8)
    : "Resolution accepted as proposed";
  return message([
    "Duevia dispute resolution decision",
    `Agreement: ${normalizeAgreementRef(input.agreementRef)}`,
    `Dispute: ${normalizeId(input.disputeId)}`,
    `Proposal event: ${normalizeId(input.proposalEventId)}`,
    `Proposal signature: ${normalizeSignature(input.proposalSignature)}`,
    `Decision: ${input.decision}`,
    `Note: ${note}`,
    `Signer: ${normalizeSigner(input.signer)}`,
    `Signed at: ${normalizeSignedAt(input.signedAt)}`,
  ]);
}

export function normalizeDisputeStatement(value: unknown, minimum = 8) {
  if (typeof value !== "string") throw new Error("A dispute statement is required.");
  const statement = value.trim().replace(/\r\n/g, "\n");
  if (statement.length < minimum || statement.length > 2_000 || statement.includes("\0")) {
    throw new Error(`The statement must be between ${minimum} and 2000 characters.`);
  }
  return statement;
}

export function normalizeEvidenceUrl(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 500) throw new Error("The evidence link is invalid.");
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("The evidence link is invalid.");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Evidence links must use HTTPS and cannot contain credentials.");
  }
  return url.toString();
}

export function normalizeEvidenceSha256(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^[0-9a-fA-F]{64}$/.test(value.trim())) {
    throw new Error("The file proof must be a 64 character SHA256 digest.");
  }
  return value.trim().toLowerCase();
}

export function isFreshDisputeSignature(signedAt: number, now = Date.now()) {
  return Number.isSafeInteger(signedAt) && Math.abs(now - signedAt) <= 10 * 60_000;
}

function message(lines: string[]) {
  return [
    ...lines,
    "",
    "This signature records a Duevia workspace statement. It does not move funds or change the escrow contract.",
  ].join("\n");
}

function normalizeAgreementRef(value: string) {
  const ref = value.trim().toUpperCase();
  if (!/^DV-[A-Z0-9]{3,16}$/.test(ref)) throw new Error("The agreement reference is invalid.");
  return ref;
}

function normalizeSigner(value: string) {
  if (!isAddress(value)) throw new Error("The signer address is invalid.");
  return getAddress(value);
}

function normalizeSignedAt(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("The signature time is invalid.");
  return new Date(value).toISOString();
}

function normalizeId(value: string) {
  if (!/^[0-9a-fA-F-]{36}$/.test(value)) throw new Error("The dispute identifier is invalid.");
  return value.toLowerCase();
}

function normalizeSignature(value: string) {
  if (!/^0x[0-9a-fA-F]+$/.test(value) || value.length > 1_000) throw new Error("The proposal signature is invalid.");
  return value.toLowerCase();
}
