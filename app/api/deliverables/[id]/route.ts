import { NextRequest, NextResponse } from "next/server";
import {
  ensureRuntimeSchema,
  getDeliverablesBucket,
  getRawDb,
} from "@/db/runtime";
import { getWalletSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getWalletSession(request);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await ensureRuntimeSchema();
  const { id } = await context.params;
  const record = await getRawDb()
    .prepare(
      `SELECT deliverables.object_key, deliverables.original_name,
        deliverables.media_type
       FROM deliverables
       INNER JOIN submissions ON submissions.id = deliverables.submission_id
       INNER JOIN milestones ON milestones.id = submissions.milestone_id
       INNER JOIN agreements ON agreements.id = milestones.agreement_id
       WHERE deliverables.id = ?
         AND (
           agreements.creator_wallet_id = ?
           OR agreements.client_wallet_id = ?
           OR agreements.provider_wallet_id = ?
         )
       LIMIT 1`,
    )
    .bind(id, session.walletId, session.walletId, session.walletId)
    .first<{
      object_key: string;
      original_name: string;
      media_type: string;
    }>();
  if (!record) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const object = await getDeliverablesBucket().get(record.object_key);
  if (!object) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return new NextResponse(object.body, {
    headers: {
      "content-type": record.media_type,
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(record.original_name)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getWalletSession(request);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await ensureRuntimeSchema();
  const { id } = await context.params;
  const db = getRawDb();
  const record = await db
    .prepare(
      `SELECT deliverables.object_key
       FROM deliverables
       INNER JOIN submissions ON submissions.id = deliverables.submission_id
       INNER JOIN milestones ON milestones.id = submissions.milestone_id
       INNER JOIN agreements ON agreements.id = milestones.agreement_id
       WHERE deliverables.id = ?
         AND submissions.submitted_by_wallet_id = ?
         AND milestones.state IN ('pending', 'in_progress', 'changes_requested')
       LIMIT 1`,
    )
    .bind(id, session.walletId)
    .first<{ object_key: string }>();
  if (!record) {
    return NextResponse.json(
      { error: "not_found", message: "This draft deliverable cannot be removed." },
      { status: 404 },
    );
  }

  await getDeliverablesBucket().delete(record.object_key);
  await db.prepare("DELETE FROM deliverables WHERE id = ?").bind(id).run();
  return NextResponse.json({ removed: true });
}
