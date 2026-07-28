import { getAddress, isAddress } from "viem";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ARC } from "@/lib/arc/config";
import {
  randomToken,
  SESSION_COOKIE,
  SESSION_DURATION_MS,
  sha256,
} from "@/lib/auth/server";
import { verifyWalletSignature } from "@/lib/auth/verify-wallet-signature";
import { ensureRuntimeSchema, getRawDb } from "@/db/runtime";

const requestSchema = z.object({
  challengeId: z.string().uuid(),
  address: z.string().refine(isAddress, "Invalid wallet address"),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/, "Invalid signature"),
});

export async function POST(request: NextRequest) {
  try {
    const input = requestSchema.parse(await request.json());
    await ensureRuntimeSchema();
    const db = getRawDb();
    const now = Date.now();
    const address = getAddress(input.address);

    const challenge = await db
      .prepare(
        `SELECT id, address, message, expires_at, used_at
         FROM auth_challenges
         WHERE id = ?
         LIMIT 1`,
      )
      .bind(input.challengeId)
      .first<{
        id: string;
        address: string;
        message: string;
        expires_at: number;
        used_at: number | null;
      }>();

    if (
      !challenge ||
      challenge.used_at !== null ||
      challenge.expires_at <= now ||
      challenge.address !== address.toLowerCase()
    ) {
      return NextResponse.json(
        { error: "challenge_invalid", message: "The sign-in request expired. Try again." },
        { status: 401 },
      );
    }

    const valid = await verifyWalletSignature({
      address,
      message: challenge.message,
      signature: input.signature as `0x${string}`,
    });
    if (!valid) {
      return NextResponse.json(
        { error: "signature_invalid", message: "The wallet signature could not be verified." },
        { status: 401 },
      );
    }

    const consumed = await db
      .prepare(
        `UPDATE auth_challenges
         SET used_at = ?, updated_at = ?
         WHERE id = ? AND used_at IS NULL`,
      )
      .bind(now, now, challenge.id)
      .run();
    if ((consumed.meta.changes ?? 0) !== 1) {
      return NextResponse.json(
        { error: "challenge_used", message: "This sign-in request was already used." },
        { status: 409 },
      );
    }

    const proposedWalletId = crypto.randomUUID();
    const sessionToken = randomToken(32);
    const sessionTokenHash = sha256(sessionToken);
    const wallet = await db
      .prepare(
        `INSERT INTO wallets (
          id, address, chain_id, display_name, last_signed_in_at,
          created_at, updated_at
        ) VALUES (?, ?, ?, NULL, ?, ?, ?)
        ON CONFLICT(chain_id, address) DO UPDATE SET
          last_signed_in_at = excluded.last_signed_in_at,
          updated_at = excluded.updated_at
        RETURNING id`,
      )
      .bind(
        proposedWalletId,
        address.toLowerCase(),
        ARC.chainId,
        now,
        now,
        now,
      )
      .first<{ id: string }>();
    if (!wallet) throw new Error("Wallet profile could not be created.");

    const sessionExpiresAt = now + SESSION_DURATION_MS;
    await db
      .prepare(
        `INSERT INTO wallet_sessions (
          id, wallet_id, token_hash, expires_at, revoked_at,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, NULL, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        wallet.id,
        await sessionTokenHash,
        sessionExpiresAt,
        now,
        now,
      )
      .run();

    const response = NextResponse.json({
      address,
      chainId: ARC.chainId,
      expiresAt: new Date(sessionExpiresAt).toISOString(),
    });
    response.cookies.set(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: new URL(request.url).protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(SESSION_DURATION_MS / 1_000),
    });
    return response;
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues[0]?.message
        : error instanceof Error
          ? error.message
          : "Wallet sign-in failed.";
    return NextResponse.json({ error: "verify_failed", message }, { status: 400 });
  }
}
