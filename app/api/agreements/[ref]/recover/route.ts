import {
  getAddress,
  zeroAddress,
} from "viem";
import { NextRequest, NextResponse } from "next/server";
import { ensureRuntimeSchema, getRawDb } from "@/db/runtime";
import {
  agreementOnchainRef,
  milestoneOnchainRef,
} from "@/lib/agreements/onchain-proof";
import { isArcRpcBusy, withArcRpcRetry } from "@/lib/arc/rpc-retry";
import { getWalletSession } from "@/lib/auth/server";
import {
  createDueviaPublicClient,
  dueviaEscrowAbi,
  dueviaFactoryAbi,
  getDueviaFactoryAddress,
} from "@/lib/contracts/duevia";

export const dynamic = "force-dynamic";

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

type MilestoneRow = {
  milestone_hash: string;
  amount_minor: string;
  due_at: number;
  review_window_seconds: number;
  revision_limit: number;
};

function sameAddress(left: string, right: string) {
  return getAddress(left) === getAddress(right);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ ref: string }> },
) {
  try {
    const session = await getWalletSession(request);
    if (!session) {
      return NextResponse.json(
        { error: "unauthorized", message: "Sign in before recovering an escrow." },
        { status: 401 },
      );
    }
    await ensureRuntimeSchema();
    const { ref } = await context.params;
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
    if (agreement.contract_address) {
      return NextResponse.json({
        contractAddress: getAddress(agreement.contract_address),
        recovered: false,
      });
    }

    const factoryAddress = getDueviaFactoryAddress();
    if (!factoryAddress) {
      return NextResponse.json(
        { error: "factory_unavailable", message: "Duevia factory is not configured." },
        { status: 503 },
      );
    }
    const expectedAgreementRef = agreementOnchainRef({
      version: agreement.version,
      publicRef: agreement.public_ref,
      agreementHash: agreement.agreement_hash,
    });
    const publicClient = createDueviaPublicClient();
    const escrow = await withArcRpcRetry(() =>
      publicClient.readContract({
        address: factoryAddress,
        abi: dueviaFactoryAbi,
        functionName: "escrowByAgreement",
        args: [expectedAgreementRef],
      }),
    );
    if (escrow === zeroAddress) {
      return NextResponse.json({ contractAddress: null, recovered: false });
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
      .all<MilestoneRow>();
    const onchainAgreementRef = await withArcRpcRetry(() =>
      publicClient.readContract({
        address: escrow,
        abi: dueviaEscrowAbi,
        functionName: "agreementRef",
      }),
    );
    const onchainClient = await withArcRpcRetry(() =>
      publicClient.readContract({
        address: escrow,
        abi: dueviaEscrowAbi,
        functionName: "client",
      }),
    );
    const onchainProvider = await withArcRpcRetry(() =>
      publicClient.readContract({
        address: escrow,
        abi: dueviaEscrowAbi,
        functionName: "provider",
      }),
    );
    const onchainTotal = await withArcRpcRetry(() =>
      publicClient.readContract({
        address: escrow,
        abi: dueviaEscrowAbi,
        functionName: "totalAmount",
      }),
    );
    const onchainCount = await withArcRpcRetry(() =>
      publicClient.readContract({
        address: escrow,
        abi: dueviaEscrowAbi,
        functionName: "milestoneCount",
      }),
    );
    const gracePeriod = await withArcRpcRetry(() =>
      publicClient.readContract({
        address: escrow,
        abi: dueviaEscrowAbi,
        functionName: "nonDeliveryGracePeriod",
      }),
    );

    let termsMatch =
      onchainAgreementRef.toLowerCase() === expectedAgreementRef.toLowerCase() &&
      sameAddress(onchainClient, agreement.client_address) &&
      sameAddress(onchainProvider, agreement.provider_address) &&
      onchainTotal === BigInt(agreement.total_amount_minor) &&
      onchainCount === BigInt(milestones.results.length) &&
      gracePeriod === 2n * 24n * 60n * 60n;
    for (const [index, milestone] of milestones.results.entries()) {
      const onchain = await withArcRpcRetry(() =>
        publicClient.readContract({
          address: escrow,
          abi: dueviaEscrowAbi,
          functionName: "getMilestone",
          args: [BigInt(index)],
        }),
      );
      const [milestoneRef, amount, dueDate, reviewWindow, revisionLimit] =
        onchain;
      termsMatch =
        termsMatch &&
        milestoneRef.toLowerCase() ===
          milestoneOnchainRef({
            version: agreement.version,
            publicRef: agreement.public_ref,
            milestoneHash: milestone.milestone_hash,
          }).toLowerCase() &&
        amount === BigInt(milestone.amount_minor) &&
        dueDate === BigInt(Math.floor(milestone.due_at / 1_000)) &&
        reviewWindow === milestone.review_window_seconds &&
        revisionLimit === milestone.revision_limit;
    }
    if (!termsMatch) {
      return NextResponse.json(
        {
          error: "recovery_terms_mismatch",
          message: "The existing Arc escrow does not match this agreement.",
        },
        { status: 422 },
      );
    }

    const now = Date.now();
    await db.batch([
      db
        .prepare(
          `UPDATE agreements SET contract_address = ?, updated_at = ?
           WHERE id = ? AND contract_address IS NULL`,
        )
        .bind(escrow, now, agreement.id),
      db
        .prepare(
          `INSERT INTO activities (
            id, agreement_id, milestone_id, actor_wallet_id, type, detail,
            tx_hash, occurred_at, created_at, updated_at
          ) VALUES (?, ?, NULL, ?, 'escrow.recovered', ?, NULL, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          agreement.id,
          session.walletId,
          JSON.stringify({ contractAddress: escrow }),
          now,
          now,
          now,
        ),
    ]);
    return NextResponse.json({
      contractAddress: getAddress(escrow),
      recovered: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "escrow_recovery_failed",
        message: isArcRpcBusy(error)
          ? "Arc is temporarily busy. Wait a moment and try recovery again."
          : "The existing Arc escrow could not be recovered safely.",
      },
      { status: 503 },
    );
  }
}
