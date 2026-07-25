import { NextRequest, NextResponse } from "next/server";
import { ensureRuntimeSchema, getRawDb } from "@/db/runtime";
import { SESSION_COOKIE, sha256 } from "@/lib/auth/server";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      await ensureRuntimeSchema();
      const now = Date.now();
      await getRawDb()
        .prepare(
          `UPDATE wallet_sessions
           SET revoked_at = ?, updated_at = ?
           WHERE token_hash = ? AND revoked_at IS NULL`,
        )
        .bind(now, now, await sha256(token))
        .run();
    } catch {
      // The cookie is still cleared even if the local persistence binding is down.
    }
  }

  const response = NextResponse.json({ signedOut: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
