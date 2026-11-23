import { NextRequest, NextResponse } from "next/server";
import { getAddress } from "viem";
import { z } from "zod";
import { ensureRuntimeSchema, getRawDb } from "@/db/runtime";
import { getWalletSession, type WalletSession } from "@/lib/auth/server";
import { verifyWalletSignature } from "@/lib/auth/verify-wallet-signature";
import { CHANGE_ORDER_SCOPES, changeOrderAcceptanceMessage, changeOrderProposalMessage, isFreshChangeOrderSignature } from "@/lib/agreements/change-order";
import type { ChangeOrderScope } from "@/lib/agreements/change-order";
import { consumeRequestLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  action: z.literal("create"),
  id: z.string().uuid(),
  title: z.string().trim().min(4).max(100),
  detail: z.string().trim().min(10).max(1_500),
  scope: z.enum(CHANGE_ORDER_SCOPES),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/).max(1_000),
  signedAt: z.number().int().positive(),
});
const acceptSchema = z.object({ action: z.literal("accept"), id: z.string().uuid(), signature: z.string().regex(/^0x[0-9a-fA-F]+$/).max(1_000), signedAt: z.number().int().positive() });

async function agreementForWallet(ref: string, walletId: string) {
  const db = getRawDb();
  return db
    .prepare(
      `SELECT id, client_wallet_id, provider_wallet_id
       FROM agreements WHERE public_ref = ?
       AND (client_wallet_id = ? OR provider_wallet_id = ?) LIMIT 1`,
    )
    .bind(ref.toUpperCase(), walletId, walletId)
    .first<{ id: string; client_wallet_id: string | null; provider_wallet_id: string | null }>();
}

export async function GET(request: NextRequest, context: { params: Promise<{ ref: string }> }) {
  const session = await getWalletSession(request);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await ensureRuntimeSchema();
  const { ref } = await context.params;
  const agreement = await agreementForWallet(ref, session.walletId);
  if (!agreement) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const result = await getRawDb()
    .prepare(
      `SELECT id, proposer_wallet_id, accepted_by_wallet_id, title, detail, scope,
              status, proposer_signature, proposer_signed_message, proposer_address, proposer_signed_at,
              acceptance_signature, acceptance_signed_message, acceptance_address, acceptance_signed_at,
              created_at, accepted_at
       FROM change_orders WHERE agreement_id = ? ORDER BY created_at DESC LIMIT 25`,
    )
    .bind(agreement.id)
    .all();
  return NextResponse.json({ orders: result.results, walletId: session.walletId });
}

export async function POST(request: NextRequest, context: { params: Promise<{ ref: string }> }) {
  try {
    const limit = await consumeRequestLimit(request, { scope: "change-order", limit: 20, windowMs: 60_000 });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "rate_limited", message: "Too many change order requests. Wait a moment and try again." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }
    const session = await getWalletSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    await ensureRuntimeSchema();
    const { ref } = await context.params;
    const agreement = await agreementForWallet(ref, session.walletId);
    if (!agreement) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const body = await request.json();
    const now = Date.now();
    const db = getRawDb();

    if ((body as { action?: unknown }).action === "create") {
      const input = createSchema.parse(body);
      requireFreshSignature(input.signedAt);
      const message = changeOrderProposalMessage({ agreementRef: ref, detail: input.detail, id: input.id, scope: input.scope, signedAt: input.signedAt, signer: session.address, title: input.title });
      await requireValidSignature(session, message, input.signature);
      await db.prepare(
        `INSERT INTO change_orders (id, agreement_id, proposer_wallet_id, title, detail, scope, status, proposer_signature, proposer_signed_message, proposer_address, proposer_signed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
      ).bind(input.id, agreement.id, session.walletId, input.title, input.detail, input.scope, input.signature.toLowerCase(), message, getAddress(session.address), input.signedAt, now, now).run();
      return NextResponse.json({ id: input.id, status: "pending" }, { status: 201 });
    }

    const input = acceptSchema.parse(body);
    const order = await db.prepare(
      `SELECT proposer_wallet_id, status, title, detail, scope, proposer_signature
       FROM change_orders WHERE id = ? AND agreement_id = ? LIMIT 1`,
    ).bind(input.id, agreement.id).first<{ proposer_wallet_id: string; status: string; title: string; detail: string; scope: ChangeOrderScope; proposer_signature: string | null }>();
    if (!order || order.status !== "pending") return NextResponse.json({ error: "order_unavailable" }, { status: 409 });
    if (order.proposer_wallet_id === session.walletId) return NextResponse.json({ error: "counterparty_required", message: "The other party must accept this change order." }, { status: 403 });
    if (!order.proposer_signature) return NextResponse.json({ error: "legacy_order", message: "This legacy change order was not wallet signed. Create a new signed change order instead." }, { status: 409 });
    requireFreshSignature(input.signedAt);
    const message = changeOrderAcceptanceMessage({ agreementRef: ref, detail: order.detail, id: input.id, proposalSignature: order.proposer_signature, scope: order.scope, signedAt: input.signedAt, signer: session.address, title: order.title });
    await requireValidSignature(session, message, input.signature);
    await db.prepare(
      `UPDATE change_orders SET status = 'accepted', accepted_by_wallet_id = ?, accepted_at = ?, acceptance_signature = ?, acceptance_signed_message = ?, acceptance_address = ?, acceptance_signed_at = ?, updated_at = ? WHERE id = ? AND agreement_id = ? AND status = 'pending'`,
    ).bind(session.walletId, now, input.signature.toLowerCase(), message, getAddress(session.address), input.signedAt, now, input.id, agreement.id).run();
    const accepted = await db.prepare("SELECT status FROM change_orders WHERE id = ? AND agreement_id = ? LIMIT 1").bind(input.id, agreement.id).first<{ status: string }>();
    if (accepted?.status !== "accepted") return NextResponse.json({ error: "order_unavailable" }, { status: 409 });
    return NextResponse.json({ id: input.id, status: "accepted" });
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : publicMessage(error);
    return NextResponse.json({ error: "change_order_failed", message }, { status: 400 });
  }
}

async function requireValidSignature(session: WalletSession, message: string, signature: string) {
  const valid = await verifyWalletSignature({ address: session.address, message, signature: signature as `0x${string}` });
  if (!valid) throw new Error("The wallet signature could not be verified.");
}

function requireFreshSignature(signedAt: number) {
  if (!isFreshChangeOrderSignature(signedAt)) throw new Error("The signed change order expired. Try again.");
}

function publicMessage(error: unknown) {
  if (!(error instanceof Error)) return "Change order could not be saved.";
  if (/wallet signature could not be verified|signed change order expired/i.test(error.message)) return error.message;
  if (/unique constraint/i.test(error.message)) return "This change order already exists.";
  return "Change order could not be saved.";
}
