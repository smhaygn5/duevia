import { formatUnits } from "viem";
import { NextResponse } from "next/server";
import { ensureRuntimeSchema, getRawDb } from "@/db/runtime";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ ref: string }> },
) {
  try {
    await ensureRuntimeSchema();
    const { ref } = await context.params;
    const db = getRawDb();
    const agreement = await db
      .prepare(
        `SELECT id, public_ref, contract_address, title, total_amount_minor,
                state, chain_id, funded_tx_hash, created_at
         FROM agreements
         WHERE public_ref = ?
         LIMIT 1`,
      )
      .bind(ref.toUpperCase())
      .first<Record<string, string | number | null>>();
    if (!agreement) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const [milestones, activities] = await Promise.all([
      db
        .prepare(
          `SELECT position, title, amount_minor, due_at, state, released_tx_hash
           FROM milestones WHERE agreement_id = ? ORDER BY position ASC`,
        )
        .bind(agreement.id)
        .all<Record<string, string | number | null>>(),
      db
        .prepare(
          `SELECT type, tx_hash, occurred_at, milestones.position AS milestone_position
           FROM activities
           LEFT JOIN milestones ON milestones.id = activities.milestone_id
           WHERE activities.agreement_id = ? AND activities.tx_hash IS NOT NULL
           ORDER BY activities.occurred_at DESC LIMIT 50`,
        )
        .bind(agreement.id)
        .all<Record<string, string | number | null>>(),
    ]);

    return NextResponse.json({
      agreement: {
        publicRef: agreement.public_ref,
        title: agreement.title,
        state: agreement.state,
        contractAddress: agreement.contract_address,
        fundedTxHash: agreement.funded_tx_hash,
        total: formatUnits(BigInt(String(agreement.total_amount_minor)), 6),
        createdAt: agreement.created_at,
      },
      milestones: milestones.results.map((milestone) => ({
        position: milestone.position,
        title: milestone.title,
        amount: formatUnits(BigInt(String(milestone.amount_minor)), 6),
        dueAt: milestone.due_at,
        state: milestone.state,
        releasedTxHash: milestone.released_tx_hash,
      })),
      activities: activities.results.map((activity) => ({
        type: activity.type,
        txHash: activity.tx_hash,
        occurredAt: activity.occurred_at,
        milestonePosition: activity.milestone_position,
      })),
    });
  } catch {
    return NextResponse.json(
      { error: "proof_unavailable", message: "The public proof is temporarily unavailable." },
      { status: 503 },
    );
  }
}
