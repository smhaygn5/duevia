import { getAddress, isAddress } from "viem";

export const CHANGE_ORDER_SCOPES = ["scope", "timeline", "delivery", "commercial"] as const;
export type ChangeOrderScope = (typeof CHANGE_ORDER_SCOPES)[number];

export function canAcceptChangeOrder(
  proposerWalletId: string,
  currentWalletId: string | null,
  status: string,
) {
  return Boolean(currentWalletId) && status === "pending" && proposerWalletId !== currentWalletId;
}

type SignatureBase = {
  agreementRef: string;
  signedAt: number;
  signer: string;
};

export function changeOrderProposalMessage(input: SignatureBase & {
  detail: string;
  id: string;
  scope: ChangeOrderScope;
  title: string;
}) {
  return message([
    "Duevia change order proposal",
    `Agreement: ${normalizeAgreementRef(input.agreementRef)}`,
    `Change order: ${normalizeId(input.id)}`,
    `Scope: ${input.scope}`,
    `Title: ${normalizeTitle(input.title)}`,
    "Detail:",
    normalizeDetail(input.detail),
    `Signer: ${normalizeSigner(input.signer)}`,
    `Signed at: ${normalizeSignedAt(input.signedAt)}`,
  ]);
}

export function changeOrderAcceptanceMessage(input: SignatureBase & {
  detail: string;
  id: string;
  proposalSignature: string;
  scope: ChangeOrderScope;
  title: string;
}) {
  return message([
    "Duevia change order acceptance",
    `Agreement: ${normalizeAgreementRef(input.agreementRef)}`,
    `Change order: ${normalizeId(input.id)}`,
    `Scope: ${input.scope}`,
    `Title: ${normalizeTitle(input.title)}`,
    "Detail:",
    normalizeDetail(input.detail),
    `Proposal signature: ${normalizeSignature(input.proposalSignature)}`,
    `Signer: ${normalizeSigner(input.signer)}`,
    `Signed at: ${normalizeSignedAt(input.signedAt)}`,
  ]);
}

export function isFreshChangeOrderSignature(signedAt: number, now = Date.now()) {
  return Number.isSafeInteger(signedAt) && Math.abs(now - signedAt) <= 10 * 60_000;
}

function message(lines: string[]) {
  return [...lines, "", "This signature records a Duevia workspace change order. It does not move funds or change the escrow contract."].join("\n");
}

function normalizeAgreementRef(value: string) {
  const ref = value.trim().toUpperCase();
  if (!/^DV-[A-Z0-9]{3,16}$/.test(ref)) throw new Error("The agreement reference is invalid.");
  return ref;
}

function normalizeId(value: string) {
  if (!/^[0-9a-fA-F-]{36}$/.test(value)) throw new Error("The change order identifier is invalid.");
  return value.toLowerCase();
}

function normalizeTitle(value: string) {
  const title = value.trim();
  if (title.length < 4 || title.length > 100 || title.includes("\0")) throw new Error("The change title must be between 4 and 100 characters.");
  return title;
}

function normalizeDetail(value: string) {
  const detail = value.trim().replace(/\r\n/g, "\n");
  if (detail.length < 10 || detail.length > 1_500 || detail.includes("\0")) throw new Error("The change detail must be between 10 and 1500 characters.");
  return detail;
}

function normalizeSigner(value: string) {
  if (!isAddress(value)) throw new Error("The signer address is invalid.");
  return getAddress(value);
}

function normalizeSignedAt(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("The signature time is invalid.");
  return new Date(value).toISOString();
}

function normalizeSignature(value: string) {
  if (!/^0x[0-9a-fA-F]+$/.test(value) || value.length > 1_000) throw new Error("The proposal signature is invalid.");
  return value.toLowerCase();
}
