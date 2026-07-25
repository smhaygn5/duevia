import { formatUnits } from "viem";
import { NextRequest, NextResponse } from "next/server";
import { ensureRuntimeSchema, getRawDb } from "@/db/runtime";
import { getWalletSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ ref: string }> },
) {
  try {
    const session = await getWalletSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    await ensureRuntimeSchema();
    const { ref } = await context.params;
    const db = getRawDb();

    const agreement = await db
      .prepare(
        `SELECT
           agreements.id,
           agreements.public_ref,
           agreements.contract_address,
           agreements.agreement_hash,
           agreements.title,
           agreements.creator_role,
           agreements.creator_wallet_id,
           agreements.client_wallet_id,
           agreements.provider_wallet_id,
           agreements.counterparty_name,
           agreements.currency,
           agreements.total_amount_minor,
           agreements.state,
           agreements.chain_id,
           agreements.funded_tx_hash,
           agreements.version,
           agreements.created_at,
           agreements.updated_at,
           client_wallet.address AS client_address,
           provider_wallet.address AS provider_address
         FROM agreements
         LEFT JOIN wallets AS client_wallet
           ON client_wallet.id = agreements.client_wallet_id
         LEFT JOIN wallets AS provider_wallet
           ON provider_wallet.id = agreements.provider_wallet_id
         WHERE agreements.public_ref = ?
           AND (
             agreements.creator_wallet_id = ?
             OR agreements.client_wallet_id = ?
             OR agreements.provider_wallet_id = ?
           )
         LIMIT 1`,
      )
      .bind(ref.toUpperCase(), session.walletId, session.walletId, session.walletId)
      .first<Record<string, string | number | null>>();
    if (!agreement) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const milestones = await db
      .prepare(
        `SELECT * FROM milestones WHERE agreement_id = ? ORDER BY position ASC`,
      )
      .bind(agreement.id)
      .all<Record<string, string | number | null>>();
    const activities = await db
      .prepare(
        `SELECT activities.type, activities.detail, activities.tx_hash,
                activities.occurred_at, milestones.position AS milestone_position
         FROM activities
         LEFT JOIN milestones ON milestones.id = activities.milestone_id
         WHERE activities.agreement_id = ?
         ORDER BY activities.occurred_at DESC
         LIMIT 100`,
      )
      .bind(agreement.id)
      .all<Record<string, string | number | null>>();
    const submissions = await db
      .prepare(
        `SELECT submissions.id, submissions.milestone_id,
                submissions.submission_hash, submissions.note,
                submissions.submitted_at, submissions.tx_hash,
                milestones.position AS milestone_position
         FROM submissions
         INNER JOIN milestones ON milestones.id = submissions.milestone_id
         WHERE milestones.agreement_id = ?
           AND submissions.tx_hash IS NOT NULL
         ORDER BY submissions.submitted_at DESC`,
      )
      .bind(agreement.id)
      .all<Record<string, string | number | null>>();
    const deliverables = await db
      .prepare(
        `SELECT deliverables.id, deliverables.submission_id,
                deliverables.original_name, deliverables.media_type,
                deliverables.size_bytes, deliverables.content_hash
         FROM deliverables
         INNER JOIN submissions ON submissions.id = deliverables.submission_id
         INNER JOIN milestones ON milestones.id = submissions.milestone_id
         WHERE milestones.agreement_id = ?
           AND submissions.tx_hash IS NOT NULL
         ORDER BY deliverables.created_at ASC`,
      )
      .bind(agreement.id)
      .all<Record<string, string | number | null>>();

    return NextResponse.json({
      agreement: {
        ...agreement,
        current_role:
          agreement.client_wallet_id === session.walletId
            ? "client"
            : agreement.provider_wallet_id === session.walletId
              ? "provider"
              : agreement.creator_role,
        total_amount: formatUnits(BigInt(String(agreement.total_amount_minor)), 6),
      },
      milestones: milestones.results.map((milestone) => ({
        ...milestone,
        amount: formatUnits(BigInt(String(milestone.amount_minor)), 6),
      })),
      activities: activities.results,
      submissions: submissions.results,
      deliverables: deliverables.results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "agreement_unavailable",
        message: error instanceof Error ? error.message : "Unable to load agreement.",
      },
      { status: 503 },
    );
  }
}
