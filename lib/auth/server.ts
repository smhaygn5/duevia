import type { NextRequest } from "next/server";
import { ensureRuntimeSchema, getRawDb } from "@/db/runtime";
import { sha256 } from "./core";

export {
  createSignInMessage,
  randomToken,
  sha256,
  sha256Bytes,
} from "./core";

export const SESSION_COOKIE = "duevia_session";
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1_000;

export type WalletSession = {
  walletId: string;
  address: `0x${string}`;
  chainId: number;
  displayName: string | null;
  expiresAt: number;
};

export async function getWalletSession(
  request: NextRequest,
): Promise<WalletSession | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  await ensureRuntimeSchema();
  const tokenHash = await sha256(token);
  const now = Date.now();
  const row = await getRawDb()
    .prepare(
      `SELECT
        wallets.id AS wallet_id,
        wallets.address AS address,
        wallets.chain_id AS chain_id,
        wallets.display_name AS display_name,
        wallet_sessions.expires_at AS expires_at
      FROM wallet_sessions
      INNER JOIN wallets ON wallets.id = wallet_sessions.wallet_id
      WHERE wallet_sessions.token_hash = ?
        AND wallet_sessions.revoked_at IS NULL
        AND wallet_sessions.expires_at > ?
      LIMIT 1`,
    )
    .bind(tokenHash, now)
    .first<{
      wallet_id: string;
      address: `0x${string}`;
      chain_id: number;
      display_name: string | null;
      expires_at: number;
    }>();

  if (!row) return null;
  return {
    walletId: row.wallet_id,
    address: row.address,
    chainId: row.chain_id,
    displayName: row.display_name,
    expiresAt: row.expires_at,
  };
}
