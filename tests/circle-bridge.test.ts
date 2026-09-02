import assert from "node:assert/strict";
import test from "node:test";
import {
  ArcBridgeError,
  bridgeResultError,
  formatArcBridgeError,
} from "../lib/circle/errors";

test("bridge failures preserve a precise source-balance message", () => {
  const error = new ArcBridgeError(
    "The source wallet has 0.5 USDC on Ethereum Sepolia, but this route requires 2 USDC.",
  );
  assert.equal(
    formatArcBridgeError(error, "Ethereum Sepolia"),
    error.message,
  );
});

test("a confirmed burn produces a resumable warning instead of a generic retry", () => {
  const error = bridgeResultError(
    {
      state: "error",
      steps: [
        { name: "approve", state: "success" },
        { name: "burn", state: "success" },
        {
          name: "fetchAttestation",
          state: "error",
          errorMessage: "temporary service timeout",
        },
      ],
    },
    "Base Sepolia",
  );

  assert.equal(error.canResume, true);
  assert.match(error.message, /burn.*already confirmed/i);
  assert.match(error.message, /do not start a new transfer/i);
});

test("wallet batch capability errors recommend the sequential route", () => {
  const error = bridgeResultError(
    {
      state: "error",
      steps: [
        {
          name: "batch",
          state: "error",
          errorCategory: "atomic_unsupported",
        },
      ],
    },
    "Arbitrum Sepolia",
  );

  assert.equal(error.canResume, false);
  assert.match(error.message, /separate approval and bridge confirmations/i);
});
