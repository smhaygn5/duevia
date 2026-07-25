import { parseUnits } from "viem";
import { NextRequest, NextResponse } from "next/server";
import { ARC } from "@/lib/arc/config";
import { getWalletSession, randomToken, sha256 } from "@/lib/auth/server";
import { agreementInputSchema } from "@/lib/agreements/validation";
import { ensureRuntimeSchema, getRawDb } from "@/db/runtime";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getWalletSession(request);
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const result = await getRawDb()
      .prepare(
        `SELECT
          agreements.public_ref,
          agreements.title,
          agreements.state,
          agreements.total_amount_minor,
          agreements.counterparty_name,
          agreements.creator_role,
          agreements.created_at,
          COUNT(milestones.id) AS milestone_count
        FROM agreements
        LEFT JOIN milestones ON milestones.agreement_id = agreements.id
        WHERE agreements.creator_wallet_id = ?
          OR agreements.client_wallet_id = ?
          OR agreements.provider_wallet_id = ?
        GROUP BY agreements.id
        ORDER BY agreements.updated_at DESC`,
      )
      .bind(session.walletId, session.walletId, session.walletId)
      .all<{
        public_ref: string;
        title: string;
        state: string;
        total_amount_minor: string;
        counterparty_name: string;
        creator_role: "client" | "provider";
        created_at: number;
        milestone_count: number;
      }>();

    return NextResponse.json({ agreements: result.results });
  } catch (error) {
    return NextResponse.json(
      {
        error: "agreements_unavailable",
        message: error instanceof Error ? error.message : "Unable to load agreements.",
      },
      { status: 503 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getWalletSession(request);
    if (!session) {
      return NextResponse.json(
        { error: "unauthorized", message: "Sign in with your wallet to create an agreement." },
        { status: 401 },
      );
    }

    const input = agreementInputSchema.parse(await request.json());
    await ensureRuntimeSchema();
    const db = getRawDb();
    const now = Date.now();
    const agreementId = crypto.randomUUID();
    const publicRef = `DV-${randomToken(5)
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 6)
      .toUpperCase()}`;
    const inviteToken = randomToken(24);
    const inviteHash = await sha256(inviteToken);

    const normalizedMilestones = input.milestones.map((milestone, index) => ({
      ...milestone,
      id: crypto.randomUUID(),
      position: index + 1,
      amountMinor: parseUnits(milestone.amount, 6),
      dueAt: Date.parse(`${milestone.dueDate}T12:00:00.000Z`),
      reviewWindowSeconds: milestone.reviewDays * 24 * 60 * 60,
    }));
    const totalAmount = normalizedMilestones.reduce(
      (total, milestone) => total + milestone.amountMinor,
      0n,
    );
    if (totalAmount <= 0n) {
      return NextResponse.json(
        { error: "invalid_amount", message: "Agreement total must be greater than zero." },
        { status: 400 },
      );
    }

    const agreementHash = await sha256(
      JSON.stringify({
        title: input.title,
        creatorRole: input.creatorRole,
        counterpartyName: input.counterpartyName,
        milestones: normalizedMilestones.map((milestone) => ({
          title: milestone.title,
          description: milestone.description,
          amountMinor: milestone.amountMinor.toString(),
          dueAt: milestone.dueAt,
          reviewWindowSeconds: milestone.reviewWindowSeconds,
          revisionLimit: milestone.revisionLimit,
        })),
      }),
    );
    const onchainMilestones = await Promise.all(
      normalizedMilestones.map(async (milestone) => ({
        ...milestone,
        milestoneHash: await sha256(
          JSON.stringify({
            agreementHash,
            position: milestone.position,
            title: milestone.title,
            amountMinor: milestone.amountMinor.toString(),
            dueAt: milestone.dueAt,
          }),
        ),
      })),
    );

    const statements = [
      db
        .prepare(
          `INSERT INTO agreements (
            id, public_ref, contract_address, agreement_hash, title,
            creator_wallet_id, creator_role, client_wallet_id, provider_wallet_id,
            counterparty_name, counterparty_email, invite_hash, currency,
            total_amount_minor, state, chain_id, funded_tx_hash, version,
            created_at, updated_at
          ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'USDC', ?,
            'awaiting_funding', ?, NULL, 1, ?, ?)`,
        )
        .bind(
          agreementId,
          publicRef,
          agreementHash,
          input.title,
          session.walletId,
          input.creatorRole,
          input.creatorRole === "client" ? session.walletId : null,
          input.creatorRole === "provider" ? session.walletId : null,
          input.counterpartyName,
          input.counterpartyEmail || null,
          inviteHash,
          totalAmount.toString(),
          ARC.chainId,
          now,
          now,
        ),
      ...onchainMilestones.map((milestone) =>
        db
          .prepare(
            `INSERT INTO milestones (
              id, agreement_id, position, milestone_hash, title, description,
              amount_minor, due_at, review_window_seconds, revision_limit,
              revisions_used, state, released_tx_hash, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'pending', NULL, ?, ?)`,
          )
          .bind(
            milestone.id,
            agreementId,
            milestone.position,
            milestone.milestoneHash,
            milestone.title,
            milestone.description,
            milestone.amountMinor.toString(),
            milestone.dueAt,
            milestone.reviewWindowSeconds,
            milestone.revisionLimit,
            now,
            now,
          ),
      ),
      db
        .prepare(
          `INSERT INTO activities (
            id, agreement_id, milestone_id, actor_wallet_id, type, detail,
            tx_hash, occurred_at, created_at, updated_at
          ) VALUES (?, ?, NULL, ?, 'agreement.created', ?, NULL, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          agreementId,
          session.walletId,
          JSON.stringify({ publicRef, title: input.title }),
          now,
          now,
          now,
        ),
    ];

    await db.batch(statements);
    return NextResponse.json(
      {
        publicRef,
        inviteUrl: `${new URL(request.url).origin}/invite/${inviteToken}`,
        totalAmountMinor: totalAmount.toString(),
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create agreement.";
    return NextResponse.json(
      { error: "agreement_create_failed", message },
      { status: 400 },
    );
  }
}
