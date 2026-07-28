import assert from "node:assert/strict";
import test from "node:test";
import { providerRequestWithTimeout } from "../lib/wallet/provider-request";

test("returns a wallet provider response before the deadline", async () => {
  const provider = {
    request: async () => ["0x1234"],
  };

  assert.deepEqual(
    await providerRequestWithTimeout<string[]>(
      provider as Pick<EthereumProvider, "request">,
      { method: "eth_accounts" },
      100,
    ),
    ["0x1234"],
  );
});

test("stops waiting for an unresponsive wallet extension", async () => {
  const provider = {
    request: () => new Promise<never>(() => {}),
  };

  await assert.rejects(
    providerRequestWithTimeout(
      provider as Pick<EthereumProvider, "request">,
      { method: "eth_accounts" },
      10,
    ),
    /did not respond in time/i,
  );
});
