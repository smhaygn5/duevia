import type { Address, Hex } from "viem";
import { ARC_CONTRACTS, USDC } from "./config";

export type ArcTransferLog = {
  txHash: Hex;
  logIndex: number;
  emitter: Address;
  from: Address;
  to: Address;
  value: bigint;
};

export type CanonicalUsdcTransfer = {
  txHash: Hex;
  logIndex: number;
  from: Address;
  to: Address;
  amountMinor: bigint;
  source: "erc20" | "native-only";
};

const NATIVE_SCALE =
  10n ** BigInt(USDC.nativeDecimals - USDC.erc20Decimals);

function transferKey(log: ArcTransferLog, amountMinor: bigint) {
  return [
    log.txHash.toLowerCase(),
    log.from.toLowerCase(),
    log.to.toLowerCase(),
    amountMinor.toString(),
  ].join(":");
}

/**
 * Arc emits a six-decimal ERC-20 Transfer and a mirrored 18-decimal native
 * transfer for most USDC movements. This function keeps the ERC-20 record and
 * removes its native mirror so the product ledger never double-counts value.
 */
export function canonicalizeArcUsdcTransfers(
  logs: readonly ArcTransferLog[],
): CanonicalUsdcTransfer[] {
  const usdcAddress = ARC_CONTRACTS.usdc.toLowerCase();
  const nativeEmitter = ARC_CONTRACTS.nativeTransferEmitter.toLowerCase();
  const erc20Keys = new Set<string>();
  const canonical: CanonicalUsdcTransfer[] = [];

  for (const log of logs) {
    if (log.emitter.toLowerCase() !== usdcAddress) continue;
    erc20Keys.add(transferKey(log, log.value));
    canonical.push({
      txHash: log.txHash,
      logIndex: log.logIndex,
      from: log.from,
      to: log.to,
      amountMinor: log.value,
      source: "erc20",
    });
  }

  for (const log of logs) {
    if (log.emitter.toLowerCase() !== nativeEmitter) continue;
    if (log.value % NATIVE_SCALE !== 0n) continue;

    const amountMinor = log.value / NATIVE_SCALE;
    if (erc20Keys.has(transferKey(log, amountMinor))) continue;

    canonical.push({
      txHash: log.txHash,
      logIndex: log.logIndex,
      from: log.from,
      to: log.to,
      amountMinor,
      source: "native-only",
    });
  }

  return canonical.sort((a, b) =>
    a.txHash === b.txHash
      ? a.logIndex - b.logIndex
      : a.txHash.localeCompare(b.txHash),
  );
}
