import {
  decodeEventLog,
  getAddress,
  isAddress,
  isHash,
  type Address,
  type Hex,
} from "viem";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureRuntimeSchema, getRawDb } from "@/db/runtime";
import { getWalletSession } from "@/lib/auth/server";
import {
  agreementOnchainRef,
  agreementRecoveryCandidates,
  milestoneOnchainRef,
} from "@/lib/agreements/onchain-proof";
import { withArcRpcRetry } from "@/lib/arc/rpc-retry";
import {
  createDueviaPublicClient,
  dueviaEscrowAbi,
  dueviaFactoryAbi,
  getDueviaFactoryAddress,
} from "@/lib/contracts/duevia";

export const dynamic = "force-dynamic";

const syncSchema = z.object({
  txHash: z.string().refine(isHash, "Invalid Arc transaction hash"),
  reviewNote: z.string().trim().min(10).max(2_000).optional(),
  submission: z
    .object({
      id: z.string().uuid(),
      hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
      note: z.string().trim().max(2_000),
    })
    .optional(),
});

type AgreementRow = {
  id: string;
  public_ref: string;
  agreement_hash: string;
  version: number;
  contract_address: string | null;
  client_address: string;
  provider_address: string;
  total_amount_minor: string;
};

function sameAddress(left: string, right: string) {
  return getAddress(left) === getAddress(right);
}

function findDecodedLogs(
  logs: readonly { address: Address; data: Hex; topics: readonly Hex[] }[],
  address: Address,
  abi: typeof dueviaFactoryAbi | typeof dueviaEscrowAbi,
) {
  const decoded = [];
  for (const log of logs) {
    if (!sameAddress(log.address, address)) continue;
    try {
      decoded.push(
        decodeEventLog({
          abi,
          data: log.data,
          topics: log.topics as [signature: Hex, ...args: Hex[]],
        }) as {
          eventName: string;
          args: Record<string, unknown>;
        },
      );
    } catch {
      // Ignore unrelated events from the same transaction.
    }
  }
  return decoded;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ ref: string }> },
) {
  try {
    const session = await getWalletSession(request);
    if (!session) {
      return NextResponse.json(
        { error: "unauthorized", message: "Sign in before syncing a transaction." },
        { status: 401 },
      );
    }
    const input = syncSchema.parse(await request.json());
    const { ref } = await context.params;
    await ensureRuntimeSchema();
    const db = getRawDb();
    const agreement = await db
      .prepare(
        `SELECT
          agreements.id,
          agreements.public_ref,
          agreements.agreement_hash,
          agreements.version,
          agreements.contract_address,
          agreements.total_amount_minor,
          client_wallet.address AS client_address,
          provider_wallet.address AS provider_address
        FROM agreements
        INNER JOIN wallets AS client_wallet
          ON client_wallet.id = agreements.client_wallet_id
        INNER JOIN wallets AS provider_wallet
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
      .first<AgreementRow>();
    if (!agreement) {
      return NextResponse.json(
        {
          error: "agreement_not_ready",
          message: "The agreement must be accepted by both parties first.",
        },
        { status: 404 },
      );
    }

    const prior = await db
      .prepare(
        `SELECT type, detail FROM activities
         WHERE agreement_id = ? AND tx_hash = ? LIMIT 1`,
      )
      .bind(agreement.id, input.txHash)
      .first<{ type: string; detail: string | null }>();
    if (prior) {
      return NextResponse.json({
        event: prior.type,
        alreadySynced: true,
        detail: prior.detail ? JSON.parse(prior.detail) : null,
      });
    }

    const publicClient = createDueviaPublicClient();
    const receipt = await withArcRpcRetry(() =>
      publicClient.getTransactionReceipt({ hash: input.txHash as Hex }),
    );
    const transaction = await withArcRpcRetry(() =>
      publicClient.getTransaction({ hash: input.txHash as Hex }),
    );
    if (receipt.status !== "success") {
      return NextResponse.json(
        { error: "transaction_reverted", message: "The Arc transaction reverted." },
        { status: 409 },
      );
    }
    if (!sameAddress(transaction.from, session.address)) {
      return NextResponse.json(
        {
          error: "transaction_sender_mismatch",
          message: "Sync the transaction from the wallet that signed it.",
        },
        { status: 403 },
      );
    }
    const now = Date.now();
    let proofVersion = agreement.version;
    let expectedAgreementRef = agreementOnchainRef({
      version: agreement.version,
      publicRef: agreement.public_ref,
      agreementHash: agreement.agreement_hash,
    });

    if (!agreement.contract_address) {
      const factoryAddress = getDueviaFactoryAddress();
      if (!factoryAddress) {
        return NextResponse.json(
          { error: "factory_unavailable", message: "Duevia factory is not configured." },
          { status: 503 },
        );
      }
      const event = findDecodedLogs(receipt.logs, factoryAddress, dueviaFactoryAbi)[0];
      if (!event || event.eventName !== "EscrowCreated") {
        return NextResponse.json(
          { error: "deployment_event_missing", message: "No Duevia escrow creation was found." },
          { status: 422 },
        );
      }
      const args = event.args as {
        agreementRef: Hex;
        escrow: Address;
        client: Address;
        provider: Address;
        totalAmount: bigint;
      };
      const matchingProof = agreementRecoveryCandidates({
        version: agreement.version,
        publicRef: agreement.public_ref,
        agreementHash: agreement.agreement_hash,
      }).find(
        (candidate) =>
          candidate.agreementRef.toLowerCase() ===
          args.agreementRef.toLowerCase(),
      );
      if (matchingProof) {
        proofVersion = matchingProof.version;
        expectedAgreementRef = matchingProof.agreementRef;
      }
      if (
        args.agreementRef.toLowerCase() !== expectedAgreementRef.toLowerCase() ||
        !sameAddress(args.client, agreement.client_address) ||
        !sameAddress(args.provider, agreement.provider_address) ||
        args.totalAmount !== BigInt(agreement.total_amount_minor)
      ) {
        return NextResponse.json(
          { error: "deployment_mismatch", message: "The deployed escrow terms do not match." },
          { status: 422 },
        );
      }
      const milestones = await db
        .prepare(
          `SELECT milestone_hash, amount_minor, due_at,
                  review_window_seconds, revision_limit
           FROM milestones
           WHERE agreement_id = ?
           ORDER BY position ASC`,
        )
        .bind(agreement.id)
        .all<{
          milestone_hash: string;
          amount_minor: string;
          due_at: number;
          review_window_seconds: number;
          revision_limit: number;
        }>();
      const count = await withArcRpcRetry(() =>
        publicClient.readContract({
          address: args.escrow,
          abi: dueviaEscrowAbi,
          functionName: "milestoneCount",
        }),
      );
      const gracePeriod = await withArcRpcRetry(() =>
        publicClient.readContract({
          address: args.escrow,
          abi: dueviaEscrowAbi,
          functionName: "nonDeliveryGracePeriod",
        }),
      );
      const onchainMilestones: Array<
        readonly [Hex, bigint, bigint, number, number, number, bigint, number]
      > = [];
      for (const [index] of milestones.results.entries()) {
        onchainMilestones.push(
          await withArcRpcRetry(() =>
            publicClient.readContract({
              address: args.escrow,
              abi: dueviaEscrowAbi,
              functionName: "getMilestone",
              args: [BigInt(index)],
            }),
          ),
        );
      }
      const termsMatch =
        count === BigInt(milestones.results.length) &&
        gracePeriod === 2n * 24n * 60n * 60n &&
        milestones.results.every((milestone, index) => {
          const onchain = onchainMilestones[index];
          if (!onchain) return false;
          const [ref, amount, dueDate, reviewWindow, revisionLimit] = onchain;
          return (
            ref.toLowerCase() ===
              milestoneOnchainRef({
                version: proofVersion,
                publicRef: agreement.public_ref,
                milestoneHash: milestone.milestone_hash,
              }).toLowerCase() &&
            amount === BigInt(milestone.amount_minor) &&
            dueDate === BigInt(Math.floor(milestone.due_at / 1_000)) &&
            reviewWindow === milestone.review_window_seconds &&
            revisionLimit === milestone.revision_limit
          );
        });
      if (!termsMatch) {
        return NextResponse.json(
          {
            error: "deployment_terms_mismatch",
            message: "The deployed escrow milestone terms do not match Duevia.",
          },
          { status: 422 },
        );
      }
      await db.batch([
        db
          .prepare(
            `UPDATE agreements
             SET contract_address = ?, version = ?, updated_at = ?
             WHERE id = ? AND contract_address IS NULL`,
          )
          .bind(args.escrow, proofVersion, now, agreement.id),
        db
          .prepare(
            `INSERT INTO activities (
              id, agreement_id, milestone_id, actor_wallet_id, type, detail,
              tx_hash, occurred_at, created_at, updated_at
            ) VALUES (?, ?, NULL, ?, 'escrow.deployed', ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            agreement.id,
            session.walletId,
            JSON.stringify({
              contractAddress: args.escrow,
              totalAmountMinor: args.totalAmount.toString(),
            }),
            input.txHash,
            now,
            now,
            now,
          ),
      ]);
      return NextResponse.json({
        event: "escrow.deployed",
        contractAddress: args.escrow,
      });
    }

    if (!isAddress(agreement.contract_address)) {
      throw new Error("Stored escrow address is invalid.");
    }
    const decodedEvents = findDecodedLogs(
      receipt.logs,
      agreement.contract_address,
      dueviaEscrowAbi,
    );
    const event =
      decodedEvents.find((candidate) => candidate.eventName === "MilestoneReleased") ??
      decodedEvents.find((candidate) => candidate.eventName === "AgreementSettled") ??
      decodedEvents[0];
    if (!event) {
      return NextResponse.json(
        { error: "escrow_event_missing", message: "No Duevia escrow event was found." },
        { status: 422 },
      );
    }
    const args = event.args;
    if (
      typeof args.agreementRef !== "string" ||
      args.agreementRef.toLowerCase() !== expectedAgreementRef.toLowerCase()
    ) {
      return NextResponse.json(
        { error: "agreement_mismatch", message: "The transaction belongs to another agreement." },
        { status: 422 },
      );
    }

    let activityType = "";
    let milestoneId: string | null = null;
    let detail: Record<string, unknown> = {};
    const updates: D1PreparedStatement[] = [];

    if (event.eventName === "AgreementFunded") {
      activityType = "agreement.funded";
      detail = { amountMinor: String(args.amount) };
      updates.push(
        db
          .prepare(
            `UPDATE agreements
             SET state = 'active', funded_tx_hash = ?, updated_at = ?
             WHERE id = ?`,
          )
          .bind(input.txHash, now, agreement.id),
      );
    } else if (
      [
        "MilestoneStarted",
        "MilestoneSubmitted",
        "ChangesRequested",
        "MilestoneReleased",
      ].includes(event.eventName)
    ) {
      const milestoneIndex = Number(args.milestoneIndex);
      const milestone = await db
        .prepare(
          `SELECT id, position FROM milestones
           WHERE agreement_id = ? AND position = ? LIMIT 1`,
        )
        .bind(agreement.id, milestoneIndex + 1)
        .first<{ id: string; position: number }>();
      if (!milestone) throw new Error("The onchain milestone was not found in Duevia.");
      milestoneId = milestone.id;
      detail = { milestonePosition: milestone.position };

      if (event.eventName === "MilestoneStarted") {
        activityType = "milestone.started";
        updates.push(
          db
            .prepare(
              `UPDATE milestones SET state = 'in_progress', updated_at = ?
               WHERE id = ?`,
            )
            .bind(now, milestone.id),
        );
      } else if (event.eventName === "MilestoneSubmitted") {
        activityType = "milestone.submitted";
        const submissionHash = String(args.submissionRef);
        if (
          input.submission &&
          input.submission.hash.toLowerCase() !== submissionHash.toLowerCase()
        ) {
          return NextResponse.json(
            { error: "submission_mismatch", message: "The submission proof does not match." },
            { status: 422 },
          );
        }
        const submissionId = input.submission?.id ?? crypto.randomUUID();
        updates.push(
          db
            .prepare(
              `UPDATE milestones SET state = 'submitted', updated_at = ?
               WHERE id = ?`,
            )
            .bind(now, milestone.id),
          db
            .prepare(
              `INSERT INTO submissions (
                id, milestone_id, submission_hash, note, submitted_by_wallet_id,
                submitted_at, tx_hash, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                submission_hash = excluded.submission_hash,
                note = excluded.note,
                submitted_at = excluded.submitted_at,
                tx_hash = excluded.tx_hash,
                updated_at = excluded.updated_at`,
            )
            .bind(
              submissionId,
              milestone.id,
              submissionHash,
              input.submission?.note || null,
              session.walletId,
              now,
              input.txHash,
              now,
              now,
            ),
        );
        detail = {
          ...detail,
          submissionHash,
          reviewDeadline: String(args.reviewDeadline),
        };
      } else if (event.eventName === "ChangesRequested") {
        activityType = "milestone.changes_requested";
        const revisionsUsed = Number(args.revisionsUsed);
        updates.push(
          db
            .prepare(
              `UPDATE milestones
               SET state = 'changes_requested', revisions_used = ?, updated_at = ?
               WHERE id = ?`,
            )
            .bind(revisionsUsed, now, milestone.id),
        );
        detail = {
          ...detail,
          revisionsUsed,
          reviewNote: input.reviewNote ?? null,
        };
      } else {
        activityType = "milestone.released";
        updates.push(
          db
            .prepare(
              `UPDATE milestones
               SET state = 'released', released_tx_hash = ?, updated_at = ?
               WHERE id = ?`,
            )
            .bind(input.txHash, now, milestone.id),
        );
        const count = await db
          .prepare("SELECT COUNT(*) AS count FROM milestones WHERE agreement_id = ?")
          .bind(agreement.id)
          .first<{ count: number }>();
        if (milestone.position === Number(count?.count ?? 0)) {
          updates.push(
            db
              .prepare(
                `UPDATE agreements SET state = 'completed', updated_at = ?
                 WHERE id = ?`,
              )
              .bind(now, agreement.id),
          );
        }
        detail = { ...detail, amountMinor: String(args.amount) };
      }
    } else if (event.eventName === "CancellationApproval") {
      activityType = "agreement.cancellation_approval";
      const approved = Boolean(args.approved);
      updates.push(
        db
          .prepare(
            `UPDATE agreements SET state = ?, updated_at = ? WHERE id = ?`,
          )
          .bind(approved ? "cancel_pending" : "active", now, agreement.id),
      );
      detail = { party: String(args.party), approved };
    } else if (event.eventName === "AgreementSettled") {
      const onchainState = Number(args.state);
      const state = onchainState === 5 ? "refunded" : onchainState === 4 ? "cancelled" : "completed";
      activityType = `agreement.${state}`;
      updates.push(
        db
          .prepare(
            `UPDATE agreements SET state = ?, updated_at = ? WHERE id = ?`,
          )
          .bind(state, now, agreement.id),
        db
          .prepare(
            `UPDATE milestones SET state = 'refunded', updated_at = ?
             WHERE agreement_id = ? AND state != 'released'`,
          )
          .bind(now, agreement.id),
      );
      detail = {
        state,
        releasedAmountMinor: String(args.releasedAmount),
        refundedAmountMinor: String(args.refundedAmount),
      };
    } else {
      return NextResponse.json(
        { error: "unsupported_event", message: "This escrow event is not supported." },
        { status: 422 },
      );
    }

    updates.push(
      db
        .prepare(
          `INSERT INTO activities (
            id, agreement_id, milestone_id, actor_wallet_id, type, detail,
            tx_hash, occurred_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          agreement.id,
          milestoneId,
          session.walletId,
          activityType,
          JSON.stringify(detail),
          input.txHash,
          now,
          now,
          now,
        ),
    );
    await db.batch(updates);

    return NextResponse.json({
      event: activityType,
      contractAddress: agreement.contract_address,
      detail,
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues[0]?.message
        : error instanceof Error
          ? error.message
          : "The Arc transaction could not be synced.";
    return NextResponse.json(
      { error: "transaction_sync_failed", message },
      { status: 400 },
    );
  }
}
