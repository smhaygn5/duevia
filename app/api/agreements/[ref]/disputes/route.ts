import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureRuntimeSchema, getRawDb } from "@/db/runtime";
import { getWalletSession, type WalletSession } from "@/lib/auth/server";
import { verifyWalletSignature } from "@/lib/auth/verify-wallet-signature";
import {
  DISPUTE_CATEGORIES,
  DISPUTE_RESOLUTIONS,
  disputeDecisionMessage,
  disputeEvidenceMessage,
  disputeOpeningMessage,
  disputeResolutionMessage,
  isFreshDisputeSignature,
  normalizeDisputeStatement,
  normalizeEvidenceSha256,
  normalizeEvidenceUrl,
  type DisputeResolution,
} from "@/lib/agreements/disputes";
import { consumeRequestLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const signatureSchema = z.string().regex(/^0x[0-9a-fA-F]+$/).max(1_000);
const signedAtSchema = z.number().int().positive();
const openSchema = z.object({
  action: z.literal("open"),
  category: z.enum(DISPUTE_CATEGORIES),
  milestonePosition: z.number().int().min(1).max(100).nullable(),
  signature: signatureSchema,
  signedAt: signedAtSchema,
  statement: z.string().min(20).max(2_000),
});
const evidenceSchema = z.object({
  action: z.literal("evidence"),
  disputeId: z.string().uuid(),
  evidenceSha256: z.string().max(64).nullable().optional(),
  evidenceUrl: z.string().max(500).nullable().optional(),
  signature: signatureSchema,
  signedAt: signedAtSchema,
  statement: z.string().min(8).max(2_000),
});
const proposeSchema = z.object({
  action: z.literal("propose"),
  disputeId: z.string().uuid(),
  note: z.string().min(12).max(2_000),
  resolution: z.enum(DISPUTE_RESOLUTIONS),
  signature: signatureSchema,
  signedAt: signedAtSchema,
});
const decisionSchema = z.object({
  action: z.enum(["accept", "reject"]),
  disputeId: z.string().uuid(),
  note: z.string().max(2_000).nullable().optional(),
  signature: signatureSchema,
  signedAt: signedAtSchema,
});

type AgreementAccess = {
  id: string;
  public_ref: string;
  creator_role: "client" | "provider";
  creator_wallet_id: string;
  client_wallet_id: string | null;
  provider_wallet_id: string | null;
};

export async function GET(request: NextRequest, context: { params: Promise<{ ref: string }> }) {
  try {
    const session = await getWalletSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    await ensureRuntimeSchema();
    const { ref } = await context.params;
    const agreement = await agreementForWallet(ref, session.walletId);
    if (!agreement) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const db = getRawDb();
    const disputes = await db.prepare(
      `SELECT disputes.id, disputes.category, disputes.status,
              disputes.proposed_resolution, disputes.proposed_by_wallet_id,
              disputes.proposal_event_id, disputes.accepted_by_wallet_id,
              disputes.opened_at, disputes.resolved_at, disputes.updated_at,
              milestones.position AS milestone_position,
              CASE WHEN disputes.opened_by_wallet_id = agreements.client_wallet_id THEN 'client' ELSE 'provider' END AS opened_by_role,
              CASE WHEN disputes.proposed_by_wallet_id = agreements.client_wallet_id THEN 'client'
                   WHEN disputes.proposed_by_wallet_id = agreements.provider_wallet_id THEN 'provider' ELSE NULL END AS proposed_by_role
       FROM disputes
       INNER JOIN agreements ON agreements.id = disputes.agreement_id
       LEFT JOIN milestones ON milestones.id = disputes.milestone_id
       WHERE disputes.agreement_id = ?
       ORDER BY disputes.opened_at DESC LIMIT 10`,
    ).bind(agreement.id).all();
    const events = await db.prepare(
      `SELECT dispute_events.id, dispute_events.dispute_id, dispute_events.kind,
              dispute_events.statement, dispute_events.evidence_url,
              dispute_events.evidence_sha256, dispute_events.resolution_type,
              dispute_events.signature, dispute_events.occurred_at,
              CASE WHEN dispute_events.actor_wallet_id = agreements.client_wallet_id THEN 'client' ELSE 'provider' END AS actor_role,
              dispute_events.actor_wallet_id
       FROM dispute_events
       INNER JOIN disputes ON disputes.id = dispute_events.dispute_id
       INNER JOIN agreements ON agreements.id = disputes.agreement_id
       WHERE disputes.agreement_id = ?
       ORDER BY dispute_events.occurred_at ASC LIMIT 150`,
    ).bind(agreement.id).all();
    return NextResponse.json({
      currentRole: agreementRole(agreement, session.walletId),
      disputes: disputes.results,
      events: events.results,
      walletId: session.walletId,
    });
  } catch (error) {
    return NextResponse.json({ error: "disputes_unavailable", message: errorMessage(error, "Disputes could not be loaded.") }, { status: 503 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ ref: string }> }) {
  try {
    const limit = await consumeRequestLimit(request, { scope: "dispute-action", limit: 30, windowMs: 60_000 });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "rate_limited", message: "Too many dispute updates. Wait a moment and try again." },
        { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }
    const session = await getWalletSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized", message: "Sign in with an agreement wallet first." }, { status: 401 });
    await ensureRuntimeSchema();
    const { ref } = await context.params;
    const agreement = await agreementForWallet(ref, session.walletId);
    if (!agreement) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (!agreement.client_wallet_id || !agreement.provider_wallet_id) {
      return NextResponse.json({ error: "counterparty_required", message: "Both parties must accept the agreement before opening a dispute." }, { status: 409 });
    }
    const body = await request.json() as { action?: unknown };
    if (body.action === "open") return openDispute(openSchema.parse(body), agreement, session);
    if (body.action === "evidence") return addEvidence(evidenceSchema.parse(body), agreement, session);
    if (body.action === "propose") return proposeResolution(proposeSchema.parse(body), agreement, session);
    if (body.action === "accept" || body.action === "reject") return decideResolution(decisionSchema.parse(body), agreement, session);
    return NextResponse.json({ error: "invalid_action", message: "The dispute action is invalid." }, { status: 400 });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 400;
    return NextResponse.json({ error: "dispute_action_failed", message: errorMessage(error, "The dispute update could not be saved.") }, { status });
  }
}

async function openDispute(input: z.infer<typeof openSchema>, agreement: AgreementAccess, session: WalletSession) {
  requireFreshSignature(input.signedAt);
  const statement = normalizeDisputeStatement(input.statement, 20);
  const message = disputeOpeningMessage({ agreementRef: agreement.public_ref, category: input.category, milestonePosition: input.milestonePosition, signedAt: input.signedAt, signer: session.address, statement });
  await requireValidSignature(session, message, input.signature);
  const db = getRawDb();
  const existing = await db.prepare(
    `SELECT id FROM disputes WHERE agreement_id = ? AND status != 'resolved' LIMIT 1`,
  ).bind(agreement.id).first();
  if (existing) return NextResponse.json({ error: "active_dispute_exists", message: "Resolve the active dispute before opening another one." }, { status: 409 });
  let milestoneId: string | null = null;
  if (input.milestonePosition !== null) {
    const milestone = await db.prepare(
      `SELECT id FROM milestones WHERE agreement_id = ? AND position = ? LIMIT 1`,
    ).bind(agreement.id, input.milestonePosition).first<{ id: string }>();
    if (!milestone) return NextResponse.json({ error: "milestone_not_found", message: "The selected milestone was not found." }, { status: 404 });
    milestoneId = milestone.id;
  }
  const disputeId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  await db.batch([
    db.prepare(
      `INSERT INTO disputes (id, agreement_id, milestone_id, opened_by_wallet_id, category, status, opened_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`,
    ).bind(disputeId, agreement.id, milestoneId, session.walletId, input.category, input.signedAt, input.signedAt),
    db.prepare(
      `INSERT INTO dispute_events (id, dispute_id, actor_wallet_id, kind, statement, signature, occurred_at)
       VALUES (?, ?, ?, 'opened', ?, ?, ?)`,
    ).bind(eventId, disputeId, session.walletId, statement, input.signature.toLowerCase(), input.signedAt),
    activityStatement(agreement.id, milestoneId, session.walletId, "dispute.opened", { category: input.category, disputeId }, input.signedAt),
  ]);
  return NextResponse.json({ disputeId, status: "open" }, { status: 201 });
}

async function addEvidence(input: z.infer<typeof evidenceSchema>, agreement: AgreementAccess, session: WalletSession) {
  requireFreshSignature(input.signedAt);
  const dispute = await disputeForAgreement(input.disputeId, agreement.id);
  if (!dispute || dispute.status === "resolved") return NextResponse.json({ error: "dispute_unavailable", message: "This dispute no longer accepts evidence." }, { status: 409 });
  const statement = normalizeDisputeStatement(input.statement, 8);
  const evidenceUrl = normalizeEvidenceUrl(input.evidenceUrl);
  const evidenceSha256 = normalizeEvidenceSha256(input.evidenceSha256);
  const message = disputeEvidenceMessage({ agreementRef: agreement.public_ref, disputeId: input.disputeId, evidenceSha256, evidenceUrl, signedAt: input.signedAt, signer: session.address, statement });
  await requireValidSignature(session, message, input.signature);
  const eventId = crypto.randomUUID();
  const db = getRawDb();
  await db.batch([
    db.prepare(
      `INSERT INTO dispute_events (id, dispute_id, actor_wallet_id, kind, statement, evidence_url, evidence_sha256, signature, occurred_at)
       VALUES (?, ?, ?, 'evidence', ?, ?, ?, ?, ?)`,
    ).bind(eventId, input.disputeId, session.walletId, statement, evidenceUrl, evidenceSha256, input.signature.toLowerCase(), input.signedAt),
    db.prepare(`UPDATE disputes SET updated_at = ? WHERE id = ?`).bind(input.signedAt, input.disputeId),
    activityStatement(agreement.id, null, session.walletId, "dispute.evidence_added", { disputeId: input.disputeId }, input.signedAt),
  ]);
  return NextResponse.json({ eventId }, { status: 201 });
}

async function proposeResolution(input: z.infer<typeof proposeSchema>, agreement: AgreementAccess, session: WalletSession) {
  requireFreshSignature(input.signedAt);
  const dispute = await disputeForAgreement(input.disputeId, agreement.id);
  if (!dispute || dispute.status !== "open") return NextResponse.json({ error: "dispute_unavailable", message: "This dispute cannot receive a new proposal." }, { status: 409 });
  const note = normalizeDisputeStatement(input.note, 12);
  const message = disputeResolutionMessage({ agreementRef: agreement.public_ref, disputeId: input.disputeId, note, resolution: input.resolution, signedAt: input.signedAt, signer: session.address });
  await requireValidSignature(session, message, input.signature);
  const eventId = crypto.randomUUID();
  const db = getRawDb();
  await db.batch([
    db.prepare(
      `INSERT INTO dispute_events (id, dispute_id, actor_wallet_id, kind, statement, resolution_type, signature, occurred_at)
       VALUES (?, ?, ?, 'resolution_proposed', ?, ?, ?, ?)`,
    ).bind(eventId, input.disputeId, session.walletId, note, input.resolution, input.signature.toLowerCase(), input.signedAt),
    db.prepare(
      `UPDATE disputes SET status = 'resolution_pending', proposed_resolution = ?, proposed_by_wallet_id = ?, proposal_event_id = ?, updated_at = ?
       WHERE id = ? AND status = 'open'`,
    ).bind(input.resolution, session.walletId, eventId, input.signedAt, input.disputeId),
    activityStatement(agreement.id, null, session.walletId, "dispute.resolution_proposed", { disputeId: input.disputeId, resolution: input.resolution }, input.signedAt),
  ]);
  return NextResponse.json({ eventId, status: "resolution_pending" });
}

async function decideResolution(input: z.infer<typeof decisionSchema>, agreement: AgreementAccess, session: WalletSession) {
  requireFreshSignature(input.signedAt);
  const dispute = await getRawDb().prepare(
    `SELECT disputes.status, disputes.proposed_by_wallet_id, disputes.proposal_event_id,
            dispute_events.signature AS proposal_signature, dispute_events.resolution_type
     FROM disputes
     INNER JOIN dispute_events ON dispute_events.id = disputes.proposal_event_id
     WHERE disputes.id = ? AND disputes.agreement_id = ? LIMIT 1`,
  ).bind(input.disputeId, agreement.id).first<{
    status: string;
    proposed_by_wallet_id: string;
    proposal_event_id: string;
    proposal_signature: string;
    resolution_type: DisputeResolution;
  }>();
  if (!dispute || dispute.status !== "resolution_pending") return NextResponse.json({ error: "proposal_unavailable", message: "The resolution proposal is no longer available." }, { status: 409 });
  if (dispute.proposed_by_wallet_id === session.walletId) return NextResponse.json({ error: "counterparty_required", message: "The other party must decide this resolution proposal." }, { status: 403 });
  const note = input.action === "reject" ? normalizeDisputeStatement(input.note ?? "", 8) : null;
  const message = disputeDecisionMessage({ agreementRef: agreement.public_ref, decision: input.action, disputeId: input.disputeId, note, proposalEventId: dispute.proposal_event_id, proposalSignature: dispute.proposal_signature, signedAt: input.signedAt, signer: session.address });
  await requireValidSignature(session, message, input.signature);
  const eventId = crypto.randomUUID();
  const statement = input.action === "accept" ? `Accepted the ${dispute.resolution_type.replaceAll("_", " ")} resolution.` : note!;
  const db = getRawDb();
  const accepted = input.action === "accept";
  await db.batch([
    db.prepare(
      `INSERT INTO dispute_events (id, dispute_id, actor_wallet_id, kind, statement, resolution_type, signature, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(eventId, input.disputeId, session.walletId, accepted ? "resolution_accepted" : "resolution_rejected", statement, dispute.resolution_type, input.signature.toLowerCase(), input.signedAt),
    accepted
      ? db.prepare(
          `UPDATE disputes SET status = 'resolved', accepted_by_wallet_id = ?, resolved_at = ?, updated_at = ?
           WHERE id = ? AND status = 'resolution_pending' AND proposal_event_id = ?`,
        ).bind(session.walletId, input.signedAt, input.signedAt, input.disputeId, dispute.proposal_event_id)
      : db.prepare(
          `UPDATE disputes SET status = 'open', proposed_resolution = NULL, proposed_by_wallet_id = NULL, proposal_event_id = NULL, updated_at = ?
           WHERE id = ? AND status = 'resolution_pending'`,
        ).bind(input.signedAt, input.disputeId),
    activityStatement(agreement.id, null, session.walletId, accepted ? "dispute.resolved" : "dispute.resolution_rejected", { disputeId: input.disputeId, resolution: dispute.resolution_type }, input.signedAt),
  ]);
  return NextResponse.json({ eventId, status: accepted ? "resolved" : "open" });
}

async function agreementForWallet(ref: string, walletId: string) {
  return getRawDb().prepare(
    `SELECT id, public_ref, creator_role, creator_wallet_id, client_wallet_id, provider_wallet_id
     FROM agreements WHERE public_ref = ?
       AND (creator_wallet_id = ? OR client_wallet_id = ? OR provider_wallet_id = ?) LIMIT 1`,
  ).bind(ref.toUpperCase(), walletId, walletId, walletId).first<AgreementAccess>();
}

function agreementRole(agreement: AgreementAccess, walletId: string) {
  return agreement.client_wallet_id === walletId ? "client" : agreement.provider_wallet_id === walletId ? "provider" : agreement.creator_role;
}

async function disputeForAgreement(disputeId: string, agreementId: string) {
  return getRawDb().prepare(
    `SELECT id, status FROM disputes WHERE id = ? AND agreement_id = ? LIMIT 1`,
  ).bind(disputeId, agreementId).first<{ id: string; status: string }>();
}

async function requireValidSignature(session: WalletSession, message: string, signature: string) {
  const valid = await verifyWalletSignature({ address: session.address, message, signature: signature as `0x${string}` });
  if (!valid) throw new Error("The wallet signature could not be verified.");
}

function requireFreshSignature(signedAt: number) {
  if (!isFreshDisputeSignature(signedAt)) throw new Error("The signed dispute action expired. Try again.");
}

function activityStatement(agreementId: string, milestoneId: string | null, walletId: string, type: string, detail: Record<string, unknown>, occurredAt: number) {
  const now = Date.now();
  return getRawDb().prepare(
    `INSERT INTO activities (id, agreement_id, milestone_id, actor_wallet_id, type, detail, tx_hash, occurred_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
  ).bind(crypto.randomUUID(), agreementId, milestoneId, walletId, type, JSON.stringify(detail), occurredAt, now, now);
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? fallback;
  if (!(error instanceof Error)) return fallback;
  if (/unique constraint.*signature|dispute_event_signature_unique/i.test(error.message)) {
    return "This signed dispute action was already recorded.";
  }
  if (/dispute_one_active_per_agreement|unique constraint failed: disputes\.agreement_id/i.test(error.message)) {
    return "Resolve the active dispute before opening another one.";
  }
  if (/sql|d1_error|constraint|table|column/i.test(error.message)) return fallback;
  return error.message.slice(0, 240) || fallback;
}
