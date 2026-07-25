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
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        network: "Arc Testnet",
        error: error instanceof Error ? error.message : "Unknown RPC error",
      },
      { status: 503 },
    );
  }
}
