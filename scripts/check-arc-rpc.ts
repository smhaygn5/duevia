import assert from "node:assert/strict";
import { ARC } from "../lib/arc/config";

type RpcResponse = {
  result?: string;
  error?: { message?: string };
};

async function readChainId(url: string) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_chainId",
        params: [],
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 750));
      continue;
    }
    if (response.status === 429) return null;

    assert.equal(response.ok, true, `${url} returned HTTP ${response.status}`);
    const payload = (await response.json()) as RpcResponse;
    const rpcBusy =
      payload.error?.message?.toLowerCase().includes("request limit") ||
      payload.error?.message?.toLowerCase().includes("rate limit");
    if (rpcBusy && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 750));
      continue;
    }
    if (rpcBusy) return null;
    assert.equal(payload.error, undefined, payload.error?.message);
    return Number.parseInt(payload.result ?? "", 16);
  }
  return null;
}

for (const [index, url] of ARC.readRpcUrls.entries()) {
  const chainId = await readChainId(url);
  if (chainId === null) {
    assert.notEqual(index, 0, "The primary Arc RPC is rate-limited");
    console.warn(`! ${url} is reachable but currently rate-limited (HTTP 429)`);
    continue;
  }
  assert.equal(chainId, ARC.chainId, `${url} returned the wrong chain`);
  console.log(`✓ ${url} → Arc Testnet (${chainId})`);
}
