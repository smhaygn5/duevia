import type { NextRequest } from "next/server";
import { ensureRuntimeSchema, getRawDb } from "@/db/runtime";

type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

function clientIdentity(request: NextRequest) {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const address =
    request.headers.get("x-duevia-client-ip")?.trim() ||
    forwarded ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown";
  const userAgent = request.headers.get("user-agent")?.slice(0, 160) ?? "unknown";
  return `${address}:${userAgent}`;
}

async function hashRateLimitKey(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function consumeRequestLimit(
  request: NextRequest,
  options: {
    scope: string;
    limit: number;
    windowMs: number;
  },
): Promise<RateLimitResult> {
  await ensureRuntimeSchema();
  const now = Date.now();
  const cutoff = now - options.windowMs;
  const key = await hashRateLimitKey(
    `${options.scope}:${clientIdentity(request)}`,
  );
  const result = await getRawDb()
    .prepare(
      `INSERT INTO api_rate_limits (
        key, window_started_at, request_count, updated_at
      ) VALUES (?, ?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET
        request_count = CASE
          WHEN api_rate_limits.window_started_at <= ? THEN 1
          ELSE api_rate_limits.request_count + 1
        END,
        window_started_at = CASE
          WHEN api_rate_limits.window_started_at <= ?
            THEN excluded.window_started_at
          ELSE api_rate_limits.window_started_at
        END,
        updated_at = excluded.updated_at
      RETURNING request_count, window_started_at`,
    )
    .bind(key, now, now, cutoff, cutoff)
    .first<{ request_count: number; window_started_at: number }>();

  if (!result) {
    throw new Error("The request limit could not be evaluated.");
  }

  const retryAfterMs = Math.max(
    result.window_started_at + options.windowMs - now,
    1_000,
  );
  return {
    allowed: result.request_count <= options.limit,
    retryAfterSeconds: Math.ceil(retryAfterMs / 1_000),
  };
}
