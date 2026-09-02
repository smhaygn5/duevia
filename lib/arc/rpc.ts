import { createPublicClient, fallback, http } from "viem";
import { ARC, arcTestnet } from "./config";

export function createArcPublicClient() {
  return createPublicClient({
    chain: arcTestnet,
    pollingInterval: 1_000,
    transport: fallback(
      ARC.readRpcUrls.map((url) =>
        http(url, {
          retryCount: 1,
          timeout: 4_000,
        }),
      ),
      {
        retryCount: 1,
        retryDelay: 100,
      },
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
