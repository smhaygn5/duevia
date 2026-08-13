import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureRuntimeSchema, getRawDb } from "@/db/runtime";
import { getWalletSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  action: z.literal("create"),
  title: z.string().trim().min(4).max(100),
  detail: z.string().trim().min(10).max(1_500),
  scope: z.enum(["scope", "timeline", "delivery", "commercial"]),
});
const acceptSchema = z.object({ action: z.literal("accept"), id: z.string().uuid() });

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
              status, created_at, accepted_at
       FROM change_orders WHERE agreement_id = ? ORDER BY created_at DESC LIMIT 25`,
    )
    .bind(agreement.id)
    .all();
  return NextResponse.json({ orders: result.results, walletId: session.walletId });
}

export async function POST(request: NextRequest, context: { params: Promise<{ ref: string }> }) {
  try {
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
      const id = crypto.randomUUID();
      await db.prepare(
        `INSERT INTO change_orders (id, agreement_id, proposer_wallet_id, title, detail, scope, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      ).bind(id, agreement.id, session.walletId, input.title, input.detail, input.scope, now, now).run();
      return NextResponse.json({ id, status: "pending" }, { status: 201 });
    }

    const input = acceptSchema.parse(body);
    const order = await db.prepare(
      `SELECT proposer_wallet_id, status FROM change_orders WHERE id = ? AND agreement_id = ? LIMIT 1`,
    ).bind(input.id, agreement.id).first<{ proposer_wallet_id: string; status: string }>();
    if (!order || order.status !== "pending") return NextResponse.json({ error: "order_unavailable" }, { status: 409 });
    if (order.proposer_wallet_id === session.walletId) return NextResponse.json({ error: "counterparty_required", message: "The other party must accept this change order." }, { status: 403 });
    await db.prepare(
      `UPDATE change_orders SET status = 'accepted', accepted_by_wallet_id = ?, accepted_at = ?, updated_at = ? WHERE id = ?`,
    ).bind(session.walletId, now, now, input.id).run();
    return NextResponse.json({ id: input.id, status: "accepted" });
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : "Change order could not be saved.";
    return NextResponse.json({ error: "change_order_failed", message }, { status: 400 });
  }
}
