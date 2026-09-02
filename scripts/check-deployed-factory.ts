import assert from "node:assert/strict";
import { createPublicClient, fallback, http, parseAbi } from "viem";
import { ARC, ARC_CONTRACTS, arcTestnet } from "../lib/arc/config";

const client = createPublicClient({
  chain: arcTestnet,
  transport: fallback(
    ARC.readRpcUrls.map((url) =>
      http(url, { retryCount: 2, timeout: 8_000 }),
    ),
  ),
});

const [chainId, runtimeCode, factoryUsdc] = await Promise.all([
  client.getChainId(),
  client.getBytecode({ address: ARC_CONTRACTS.dueviaFactory }),
  client.readContract({
    address: ARC_CONTRACTS.dueviaFactory,
    abi: parseAbi(["function usdc() view returns (address)"]),
    functionName: "usdc",
  }),
]);

assert.equal(chainId, ARC.chainId, "The RPC returned the wrong Arc chain");
assert.ok(runtimeCode && runtimeCode !== "0x", "Factory runtime code is missing");
assert.equal(
  factoryUsdc.toLowerCase(),
  ARC_CONTRACTS.usdc.toLowerCase(),
  "The factory is bound to the wrong USDC contract",
);

console.log(
  `✓ Duevia factory ${ARC_CONTRACTS.dueviaFactory} is live on Arc Testnet`,
);
console.log(`✓ Factory USDC ${factoryUsdc}`);
