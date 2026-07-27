import { getAddress, isAddress } from "viem";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ARC } from "@/lib/arc/config";
import {
  createSignInMessage,
  randomToken,
  resolveAuthOrigin,
} from "@/lib/auth/server";
import { ensureRuntimeSchema, getRawDb } from "@/db/runtime";

const requestSchema = z.object({
  address: z.string().refine(isAddress, "Invalid wallet address"),
  chainId: z.number().int(),
});

export async function POST(request: NextRequest) {
  try {
    const input = requestSchema.parse(await request.json());
    if (input.chainId !== ARC.chainId) {
      return NextResponse.json(
        {
          error: "wrong_network",
          message: "Switch your wallet to Arc Testnet before signing in.",
        },
        { status: 409 },
      );
    }

    await ensureRuntimeSchema();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1_000);
    const challengeId = crypto.randomUUID();
    const nonce = randomToken(18);
    const address = getAddress(input.address);
    const origin = resolveAuthOrigin({
      requestUrl: request.url,
      forwardedHost: request.headers.get("x-forwarded-host"),
      forwardedProto: request.headers.get("x-forwarded-proto"),
    });
    const message = createSignInMessage({
      address,
      origin,
      nonce,
      issuedAt: now.toISOString(),
      expirationTime: expiresAt.toISOString(),
    });

    await getRawDb()
      .prepare(
        `INSERT INTO auth_challenges (
          id, address, chain_id, message, nonce, expires_at, used_at,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      )
      .bind(
        challengeId,
        address.toLowerCase(),
        ARC.chainId,
        message,
        nonce,
        expiresAt.getTime(),
        now.getTime(),
        now.getTime(),
      )
      .run();

    return NextResponse.json({
      challengeId,
      message,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues[0]?.message
        : error instanceof Error
          ? error.message
          : "Unable to create sign-in challenge.";
    return NextResponse.json({ error: "challenge_failed", message }, { status: 400 });
  }
}
