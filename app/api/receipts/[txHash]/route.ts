import { formatUnits, isHash } from "viem";
import { NextRequest, NextResponse } from "next/server";
import { ensureRuntimeSchema, getRawDb } from "@/db/runtime";
import { getWalletSession } from "@/lib/auth/server";
import { receiptTitle } from "@/lib/agreements/receipt-title";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ txHash: string }> },
) {
  try {
    const session = await getWalletSession(request);
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const { txHash } = await context.params;
    if (!isHash(txHash)) {
      return NextResponse.json({ error: "invalid_hash" }, { status: 400 });
    }
    await ensureRuntimeSchema();
    const row = await getRawDb()
      .prepare(
        `SELECT
           activities.type,
           activities.detail,
           activities.tx_hash,
           activities.occurred_at,
           agreements.public_ref,
           agreements.title AS agreement_title,
           agreements.contract_address,
           client_wallet.address AS client_address,
           provider_wallet.address AS provider_address,
           milestones.position AS milestone_position,
           milestones.title AS milestone_title,
           milestones.amount_minor AS milestone_amount_minor
         FROM activities
         INNER JOIN agreements ON agreements.id = activities.agreement_id
         LEFT JOIN milestones ON milestones.id = activities.milestone_id
         LEFT JOIN wallets AS client_wallet
           ON client_wallet.id = agreements.client_wallet_id
         LEFT JOIN wallets AS provider_wallet
           ON provider_wallet.id = agreements.provider_wallet_id
         WHERE activities.tx_hash = ?
           AND (
             agreements.creator_wallet_id = ?
             OR agreements.client_wallet_id = ?
             OR agreements.provider_wallet_id = ?
           )
         LIMIT 1`,
      )
      .bind(txHash, session.walletId, session.walletId, session.walletId)
      .first<{
        type: string;
        detail: string | null;
        tx_hash: string;
        occurred_at: number;
        public_ref: string;
        agreement_title: string;
        contract_address: string | null;
        client_address: string | null;
        provider_address: string | null;
        milestone_position: number | null;
        milestone_title: string | null;
        milestone_amount_minor: string | null;
      }>();
    if (!row) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const detail = row.detail
      ? (JSON.parse(row.detail) as Record<string, unknown>)
      : {};
    const amountMinor =
      row.milestone_amount_minor ??
      String(
        detail.amountMinor ??
          detail.refundedAmountMinor ??
          detail.releasedAmountMinor ??
          "0",
      );
    const recipient =
      row.type === "milestone.released"
        ? row.provider_address
        : row.type.includes("refund") || row.type.includes("cancel")
          ? row.client_address
          : row.contract_address;

    return NextResponse.json({
      receipt: {
        status: "Confirmed",
        title: receiptTitle(row.type),
        description: `${formatUnits(BigInt(amountMinor), 6)} USDC was verified on Arc.`,
        agreement: row.public_ref,
        agreementTitle: row.agreement_title,
        milestone:
          row.milestone_position && row.milestone_title
            ? `${String(row.milestone_position).padStart(2, "0")} · ${row.milestone_title}`
            : "Agreement",
        amount: `${Number(formatUnits(BigInt(amountMinor), 6)).toLocaleString()} USDC`,
        recipient,
        network: "Arc Testnet",
        date: new Date(row.occurred_at).toLocaleString("en", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "UTC",
        }),
        txHash: row.tx_hash,
        approvalChecklist: Array.isArray(detail.approvalChecklist)
          ? detail.approvalChecklist.filter(
              (item): item is string => typeof item === "string",
            )
          : [],
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "receipt_unavailable",
        message:
          error instanceof Error ? error.message : "Receipt could not be loaded.",
      },
      { status: 503 },
    );
  }
}
