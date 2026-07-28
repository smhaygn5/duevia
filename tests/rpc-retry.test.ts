import assert from "node:assert/strict";
import test from "node:test";
import { isArcRpcBusy } from "../lib/arc/rpc-retry";

test("recognizes Arc public RPC throttling across nested errors", () => {
  assert.equal(isArcRpcBusy(new Error("request limit reached")), true);
  assert.equal(
    isArcRpcBusy({
      message: "Contract call failed",
      cause: { code: -32011, message: "RPC Request failed" },
    }),
    true,
  );
  assert.equal(isArcRpcBusy(new Error("execution reverted")), false);
});
