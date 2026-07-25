import assert from "node:assert/strict";
import { AppKit } from "@circle-fin/app-kit";
import { ARC } from "../lib/arc/config";

const kit = new AppKit();

function findArc(operation: "bridge" | "unifiedBalance") {
  const match = kit
    .getSupportedChains(operation)
    .find(
      (chain) => chain.type === "evm" && chain.chainId === ARC.chainId,
    );
  assert.ok(match, `Arc Testnet is missing from ${operation} support`);
  assert.equal(match.type, "evm");
  if (match.type !== "evm") {
    throw new Error(`Arc Testnet is not exposed as an EVM chain for ${operation}`);
  }
  return match;
}

const bridge = findArc("bridge");
const unifiedBalance = findArc("unifiedBalance");

console.log(`✓ Bridge: Arc Testnet (${bridge.chainId})`);
console.log(`✓ Unified Balance: Arc Testnet (${unifiedBalance.chainId})`);
