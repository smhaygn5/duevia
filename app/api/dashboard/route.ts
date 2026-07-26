import { NextRequest, NextResponse } from "next/server";
import { getRawDb } from "@/db/runtime";
import { getWalletSession } from "@/lib/auth/server";
import {
  computeDashboardSummary,
  type DashboardActivityRow,
  type DashboardAgreementRow,
  type DashboardMilestoneRow,
} from "@/lib/dashboard";

export const dynamic = "force-dynamic";

type AgreementRecord = DashboardAgreementRow & {
  public_ref: string;
  title: string;
  total_amount_minor: string;
  counterparty_name: string;
  updated_at: number;
};

type ActivityRecord = DashboardActivityRow & {
  id: string;
  type: string;
  detail: string | null;
  occurred_at: number;
  agreement_ref: string;
  agreement_title: string;
};

function parseDetail(value: string | null) {
  if (!value) return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getWalletSession(request);
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const db = getRawDb();
    const participantWhere = `
      agreements.creator_wallet_id = ?
      OR agreements.client_wallet_id = ?
      OR agreements.provider_wallet_id = ?`;
    const bindings = [session.walletId, session.walletId, session.walletId];

    const [agreementResult, milestoneResult, activityResult, verifiedCount] =
      await Promise.all([
      db
        .prepare(
          `SELECT id, public_ref, title, state, total_amount_minor,
             counterparty_name, updated_at
           FROM agreements
           WHERE ${participantWhere}
           ORDER BY updated_at DESC`,
        )
        .bind(...bindings)
        .all<AgreementRecord>(),
      db
        .prepare(
          `SELECT milestones.agreement_id, milestones.state,
             milestones.amount_minor
           FROM milestones
           INNER JOIN agreements ON agreements.id = milestones.agreement_id
           WHERE ${participantWhere}`,
        )
        .bind(...bindings)
        .all<DashboardMilestoneRow>(),
      db
        .prepare(
          `SELECT activities.id, activities.type, activities.detail,
             activities.tx_hash, activities.occurred_at,
             agreements.public_ref AS agreement_ref,
             agreements.title AS agreement_title
           FROM activities
           INNER JOIN agreements ON agreements.id = activities.agreement_id
           WHERE ${participantWhere}
           ORDER BY activities.occurred_at DESC
           LIMIT 25`,
        )
        .bind(...bindings)
        .all<ActivityRecord>(),
      db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM activities
           INNER JOIN agreements ON agreements.id = activities.agreement_id
           WHERE (${participantWhere})
             AND activities.tx_hash IS NOT NULL`,
        )
        .bind(...bindings)
        .first<{ count: number }>(),
      ]);

    const agreements = agreementResult.results;
    const milestones = milestoneResult.results;
    const activities = activityResult.results;
    const summary = computeDashboardSummary(
      agreements,
      milestones,
      activities,
    );
    summary.verifiedEvents = Number(verifiedCount?.count ?? 0);

    return NextResponse.json({
      source: "arc-verified",
      summary,
      agreements: agreements.slice(0, 5).map((agreement) => ({
        public_ref: agreement.public_ref,
        title: agreement.title,
        state: agreement.state,
        total_amount_minor: agreement.total_amount_minor,
        counterparty_name: agreement.counterparty_name,
        updated_at: agreement.updated_at,
      })),
      activities: activities.map((activity) => ({
        ...activity,
        detail: parseDetail(activity.detail),
      })),
      updatedAt: Math.max(
        0,
        ...agreements.map((agreement) => agreement.updated_at),
        ...activities.map((activity) => activity.occurred_at),
      ),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "dashboard_unavailable",
        message:
          error instanceof Error
            ? error.message
            : "Unable to load the verified workspace.",
      },
      { status: 503 },
    );
  }
}
