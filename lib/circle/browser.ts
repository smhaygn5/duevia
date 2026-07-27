"use client";

import type { ChainDefinition } from "@circle-fin/app-kit";
import type { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { getSelectedEthereumProvider } from "@/lib/wallet/selected-provider";

export const fundingSources = [
  { value: "Arc_Testnet", label: "Arc Testnet", chainId: 5_042_002 },
  {
    value: "Ethereum_Sepolia",
    label: "Ethereum Sepolia",
    chainId: 11_155_111,
  },
  { value: "Base_Sepolia", label: "Base Sepolia", chainId: 84_532 },
  {
    value: "Arbitrum_Sepolia",
    label: "Arbitrum Sepolia",
    chainId: 421_614,
  },
] as const;

export type FundingSource = (typeof fundingSources)[number]["value"];

export type BridgeQuote = {
  amount: string;
  protocolFee: string;
  gasSummary: string;
  source: string;
  destination: string;
};

export type UnifiedBalance = {
  total: string;
  chains: number;
};

type AdapterProvider = Parameters<
  typeof createViemAdapterFromProvider
>[0]["provider"];

async function createBridgeContext(source: FundingSource) {
  const selectedProvider = getSelectedEthereumProvider();
  if (!selectedProvider) {
    throw new Error("Choose and connect an EVM wallet first.");
  }

  const [{ AppKit }, { createViemAdapterFromProvider }] =
    await Promise.all([
      import("@circle-fin/app-kit"),
      import("@circle-fin/adapter-viem-v2"),
    ]);
  const kit = new AppKit();
  const supportedChains = kit
    .getSupportedChains("bridge")
    .filter((chain): chain is Extract<ChainDefinition, { type: "evm" }> => {
      return chain.type === "evm" && chain.isTestnet;
    });
  const sourceChain = supportedChains.find((chain) => chain.chain === source);
  const destinationChain = supportedChains.find(
    (chain) => chain.chain === "Arc_Testnet",
  );
  if (!sourceChain || !destinationChain) {
    throw new Error("Circle App Kit does not expose this Arc testnet route.");
  }
  const adapter = await createViemAdapterFromProvider({
    provider: selectedProvider as AdapterProvider,
    capabilities: {
      addressContext: "user-controlled",
      supportedChains,
    },
  });
  return { kit, adapter, sourceChain, destinationChain };
}

export async function estimateArcBridge(
  source: FundingSource,
  amount: string,
): Promise<BridgeQuote> {
  const { kit, adapter, sourceChain, destinationChain } =
    await createBridgeContext(source);
  const result = await kit.estimateBridge({
    from: { adapter, chain: sourceChain },
    to: { adapter, chain: destinationChain },
    amount,
    token: "USDC",
  });

  const protocolFee = result.fees
    .reduce((sum, fee) => sum + Number(fee.amount ?? 0), 0)
    .toFixed(6)
    .replace(/\.?0+$/, "");
  const gasTokens = Array.from(
    new Set(
      result.gasFees
        .filter((fee) => !fee.error)
        .map((fee) => fee.token),
    ),
  );

  return {
    amount: result.amount,
    protocolFee: protocolFee || "0",
    gasSummary: gasTokens.length ? gasTokens.join(" + ") : "Wallet estimate",
    source: result.source.chain,
    destination: result.destination.chain,
  };
}

export async function executeArcBridge(
  source: FundingSource,
  amount: string,
) {
  if (source === "Arc_Testnet") {
    return { state: "success" as const, steps: 0 };
  }
  const { kit, adapter, sourceChain, destinationChain } =
    await createBridgeContext(source);
  const result = await kit.bridge({
    from: { adapter, chain: sourceChain },
    to: { adapter, chain: destinationChain },
    amount,
    token: "USDC",
  });
  if (result.state !== "success") {
    throw new Error("Circle did not complete the bridge route.");
  }
  return { state: result.state, steps: result.steps.length };
}

export async function getUnifiedUsdcBalance(
  address: `0x${string}`,
): Promise<UnifiedBalance> {
  const { AppKit } = await import("@circle-fin/app-kit");
  const kit = new AppKit();
  const result = await kit.unifiedBalance.getBalances({
    token: "USDC",
    sources: { address },
    networkType: "testnet",
  });

  return {
    total: result.totalConfirmedBalance,
    chains: result.breakdown.reduce(
      (sum, account) => sum + account.breakdown.length,
      0,
    ),
  };
}
