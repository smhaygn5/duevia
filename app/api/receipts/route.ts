import { formatUnits } from "viem";
import { NextRequest, NextResponse } from "next/server";
import { ensureRuntimeSchema, getRawDb } from "@/db/runtime";
import { getWalletSession } from "@/lib/auth/server";
import { isSettlementReceipt, receiptTitle } from "@/lib/agreements/receipt-title";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getWalletSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    await ensureRuntimeSchema();
    const rows = await getRawDb().prepare(
      `SELECT activities.type, activities.detail, activities.tx_hash, activities.occurred_at,
              agreements.public_ref, agreements.title AS agreement_title,
              milestones.position AS milestone_position, milestones.title AS milestone_title,
              milestones.amount_minor AS milestone_amount_minor
       FROM activities
       INNER JOIN agreements ON agreements.id = activities.agreement_id
       LEFT JOIN milestones ON milestones.id = activities.milestone_id
       WHERE activities.tx_hash IS NOT NULL
         AND (agreements.creator_wallet_id = ? OR agreements.client_wallet_id = ? OR agreements.provider_wallet_id = ?)
       ORDER BY activities.occurred_at DESC LIMIT 100`,
    ).bind(session.walletId, session.walletId, session.walletId).all<{
      type: string; detail: string | null; tx_hash: string; occurred_at: number; public_ref: string; agreement_title: string;
      milestone_position: number | null; milestone_title: string | null; milestone_amount_minor: string | null;
    }>();
    return NextResponse.json({
      receipts: rows.results.filter((row) => isSettlementReceipt(row.type)).map((row) => {
        let detail: Record<string, unknown> = {};
        try {
          detail = row.detail ? JSON.parse(row.detail) as Record<string, unknown> : {};
        } catch {
          detail = {};
        }
        const amountMinor = row.milestone_amount_minor ?? String(detail.refundedAmountMinor ?? detail.releasedAmountMinor ?? detail.amountMinor ?? "0");
        return {
          txHash: row.tx_hash,
          title: receiptTitle(row.type),
          agreement: row.public_ref,
          agreementTitle: row.agreement_title,
          milestone: row.milestone_position && row.milestone_title ? `${String(row.milestone_position).padStart(2, "0")} · ${row.milestone_title}` : "Agreement",
          amount: `${Number(formatUnits(BigInt(amountMinor), 6)).toLocaleString()} USDC`,
          occurredAt: row.occurred_at,
        };
      }),
    });
  } catch (error) {
    return NextResponse.json({ error: "receipts_unavailable", message: error instanceof Error ? error.message : "Receipts could not be loaded." }, { status: 503 });
  }
}
