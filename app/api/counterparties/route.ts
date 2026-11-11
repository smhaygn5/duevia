import { NextRequest, NextResponse } from "next/server";
import { getWalletSession } from "@/lib/auth/server";
import { ensureRuntimeSchema, getRawDb } from "@/db/runtime";

export const dynamic = "force-dynamic";

/** Lists only counterparties from agreements visible to the signed-in wallet. */
export async function GET(request: NextRequest) {
  try {
    const session = await getWalletSession(request);
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    await ensureRuntimeSchema();
    const result = await getRawDb()
      .prepare(
        `SELECT
           counterparty_name AS name,
           counterparty_email AS email,
           COUNT(*) AS agreement_count,
           MAX(updated_at) AS last_used_at
         FROM agreements
         WHERE creator_wallet_id = ?
            OR client_wallet_id = ?
            OR provider_wallet_id = ?
         GROUP BY counterparty_name, counterparty_email
         ORDER BY last_used_at DESC, agreement_count DESC
         LIMIT 12`,
      )
      .bind(session.walletId, session.walletId, session.walletId)
      .all<{
        name: string;
        email: string | null;
        agreement_count: number;
        last_used_at: number;
      }>();

    return NextResponse.json({ counterparties: result.results });
  } catch (error) {
    return NextResponse.json(
      {
        error: "counterparties_unavailable",
        message: error instanceof Error ? error.message : "Unable to load counterparties.",
      },
      { status: 503 },
    );
  }
}
