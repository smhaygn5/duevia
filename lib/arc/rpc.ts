import { createPublicClient, fallback, http } from "viem";
import { ARC, arcTestnet } from "./config";

export function createArcPublicClient() {
  return createPublicClient({
    chain: arcTestnet,
    transport: fallback(
      ARC.readRpcUrls.map((url) =>
        http(url, {
          retryCount: 2,
          timeout: 5_000,
        }),
      ),
    ),
  });
}

export async function readArcNetworkStatus() {
  const client = createArcPublicClient();
  const [chainId, blockNumber] = await Promise.all([
    client.getChainId(),
    client.getBlockNumber(),
  ]);

  if (chainId !== ARC.chainId) {
    throw new Error(
      `Arc chain mismatch: expected ${ARC.chainId}, received ${chainId}`,
    );
  }

  return {
    chainId,
    blockNumber: blockNumber.toString(),
    checkedAt: new Date().toISOString(),
  };
}
