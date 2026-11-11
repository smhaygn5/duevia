import { NextResponse } from "next/server";
import { readArcNetworkStatus } from "@/lib/arc/rpc";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await readArcNetworkStatus();
    return NextResponse.json({
      ok: true,
      network: "Arc Testnet",
      ...status,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        network: "Arc Testnet",
        error: "Arc network status is temporarily unavailable.",
      },
      { status: 503 },
    );
  }
}
