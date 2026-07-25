import assert from "node:assert/strict";
import test from "node:test";
import type { Address, Hex } from "viem";
import { ARC_CONTRACTS } from "../lib/arc/config";
import {
  canonicalizeArcUsdcTransfers,
  type ArcTransferLog,
} from "../lib/arc/usdc-events";

const tx = `0x${"ab".repeat(32)}` as Hex;
const from = `0x${"11".repeat(20)}` as Address;
const to = `0x${"22".repeat(20)}` as Address;

test("collapses Arc's mirrored native and ERC-20 USDC transfer", () => {
  const logs: ArcTransferLog[] = [
    {
      txHash: tx,
      logIndex: 4,
      emitter: ARC_CONTRACTS.usdc,
      from,
      to,
      value: 25_000_000n,
    },
    {
      txHash: tx,
      logIndex: 5,
      emitter: ARC_CONTRACTS.nativeTransferEmitter,
      from,
      to,
      value: 25_000_000_000_000_000_000n,
    },
  ];

  assert.deepEqual(canonicalizeArcUsdcTransfers(logs), [
    {
      txHash: tx,
      logIndex: 4,
      from,
      to,
      amountMinor: 25_000_000n,
      source: "erc20",
    },
  ]);
});

test("keeps a native-only transfer in six-decimal ledger units", () => {
  const logs: ArcTransferLog[] = [
    {
      txHash: tx,
      logIndex: 2,
      emitter: ARC_CONTRACTS.nativeTransferEmitter,
      from,
      to,
      value: 1_500_000_000_000_000_000n,
    },
  ];

  assert.equal(canonicalizeArcUsdcTransfers(logs)[0]?.amountMinor, 1_500_000n);
  assert.equal(canonicalizeArcUsdcTransfers(logs)[0]?.source, "native-only");
});

test("ignores unrelated logs and non-canonical native values", () => {
  const unrelated = `0x${"33".repeat(20)}` as Address;
  const logs: ArcTransferLog[] = [
    {
      txHash: tx,
      logIndex: 1,
      emitter: unrelated,
      from,
      to,
      value: 100n,
    },
    {
      txHash: tx,
      logIndex: 2,
      emitter: ARC_CONTRACTS.nativeTransferEmitter,
      from,
      to,
      value: 1n,
    },
  ];

  assert.deepEqual(canonicalizeArcUsdcTransfers(logs), []);
});
