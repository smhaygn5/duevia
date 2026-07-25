import { NextRequest, NextResponse } from "next/server";
import { getWalletSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getWalletSession(request);
    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }
    return NextResponse.json({ authenticated: true, ...session });
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 503 });
  }
}
