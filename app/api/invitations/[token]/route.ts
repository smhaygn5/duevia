import { formatUnits } from "viem";
import { NextRequest, NextResponse } from "next/server";
import { ensureRuntimeSchema, getRawDb } from "@/db/runtime";
import { getWalletSession, sha256 } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

async function findInvitation(token: string) {
  await ensureRuntimeSchema();
  const db = getRawDb();
  const agreement = await db
    .prepare(
      `SELECT
        agreements.*,
        wallets.address AS creator_address,
        wallets.display_name AS creator_name
       FROM agreements
       INNER JOIN wallets ON wallets.id = agreements.creator_wallet_id
       WHERE agreements.invite_hash = ?
       LIMIT 1`,
    )
    .bind(await sha256(token))
    .first<Record<string, string | number | null>>();
  if (!agreement) return null;

  const milestones = await db
    .prepare(
      `SELECT position, title, description, amount_minor, due_at,
        review_window_seconds, revision_limit
       FROM milestones WHERE agreement_id = ? ORDER BY position ASC`,
    )
    .bind(agreement.id)
    .all<{
      position: number;
      title: string;
      description: string;
      amount_minor: string;
      due_at: number;
      review_window_seconds: number;
      revision_limit: number;
    }>();
  return { agreement, milestones: milestones.results };
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const invitation = await findInvitation(token);
    if (!invitation) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({
      agreement: {
        publicRef: invitation.agreement.public_ref,
        title: invitation.agreement.title,
        creatorRole: invitation.agreement.creator_role,
        creatorAddress: invitation.agreement.creator_address,
        creatorName: invitation.agreement.creator_name,
        counterpartyName: invitation.agreement.counterparty_name,
        totalAmount: formatUnits(
          BigInt(String(invitation.agreement.total_amount_minor)),
          6,
        ),
        state: invitation.agreement.state,
        accepted:
          invitation.agreement.creator_role === "provider"
            ? Boolean(invitation.agreement.client_wallet_id)
            : Boolean(invitation.agreement.provider_wallet_id),
      },
      milestones: invitation.milestones.map((milestone) => ({
        ...milestone,
        amount: formatUnits(BigInt(milestone.amount_minor), 6),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "invitation_unavailable",
        message: error instanceof Error ? error.message : "Unable to load invitation.",
      },
      { status: 503 },
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const session = await getWalletSession(request);
    if (!session) {
      return NextResponse.json(
        { error: "unauthorized", message: "Sign in with your wallet to accept." },
        { status: 401 },
      );
    }
    const { token } = await context.params;
    const invitation = await findInvitation(token);
    if (!invitation) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (invitation.agreement.creator_wallet_id === session.walletId) {
      return NextResponse.json(
        { error: "same_party", message: "The creator cannot accept their own invitation." },
        { status: 409 },
      );
    }

    const targetColumn =
      invitation.agreement.creator_role === "provider"
        ? "client_wallet_id"
        : "provider_wallet_id";
    if (invitation.agreement[targetColumn]) {
      return NextResponse.json(
        { error: "already_accepted", message: "This invitation has already been accepted." },
        { status: 409 },
      );
    }

    const db = getRawDb();
    const now = Date.now();
    await db.batch([
      db
        .prepare(
          `UPDATE agreements SET ${targetColumn} = ?, updated_at = ?
           WHERE id = ? AND ${targetColumn} IS NULL`,
        )
        .bind(session.walletId, now, invitation.agreement.id),
      db
        .prepare(
          `INSERT INTO activities (
            id, agreement_id, milestone_id, actor_wallet_id, type, detail,
            tx_hash, occurred_at, created_at, updated_at
          ) VALUES (?, ?, NULL, ?, 'agreement.accepted', ?, NULL, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          invitation.agreement.id,
          session.walletId,
          JSON.stringify({ publicRef: invitation.agreement.public_ref }),
          now,
          now,
          now,
        ),
    ]);

    return NextResponse.json({
      accepted: true,
      publicRef: invitation.agreement.public_ref,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "invitation_accept_failed",
        message: error instanceof Error ? error.message : "Unable to accept invitation.",
      },
      { status: 400 },
    );
  }
}
