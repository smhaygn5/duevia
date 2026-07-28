"use client";

import type { ChainDefinition } from "@circle-fin/app-kit";
import type { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import {
  createPublicClient,
  custom,
  defineChain,
  erc20Abi,
  formatUnits,
  getAddress,
  parseUnits,
  type Address,
} from "viem";
import {
  arbitrumSepolia,
  baseSepolia,
  sepolia,
} from "viem/chains";
import { ARC } from "@/lib/arc/config";
import {
  ArcBridgeError,
  bridgeResultError,
  formatArcBridgeError,
  type BridgeResultLike,
} from "@/lib/circle/errors";
import { getSelectedEthereumProvider } from "@/lib/wallet/selected-provider";

export const fundingSources = [
  {
    value: "Arc_Testnet",
    label: "Arc Testnet",
    chainId: ARC.chainId,
    walletChain: defineChain({
      id: ARC.chainId,
      name: "Arc Testnet",
      nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
      rpcUrls: { default: { http: [...ARC.rpcUrls] } },
      blockExplorers: {
        default: { name: "Arcscan", url: ARC.explorerUrl },
      },
      testnet: true,
    }),
  },
  {
    value: "Ethereum_Sepolia",
    label: "Ethereum Sepolia",
    chainId: 11_155_111,
    walletChain: sepolia,
  },
  {
    value: "Base_Sepolia",
    label: "Base Sepolia",
    chainId: 84_532,
    walletChain: baseSepolia,
  },
  {
    value: "Arbitrum_Sepolia",
    label: "Arbitrum Sepolia",
    chainId: 421_614,
    walletChain: arbitrumSepolia,
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

type BridgeContext = Awaited<ReturnType<typeof createBridgeContext>>;

type ResumableBridge = {
  key: string;
  resume: () => Promise<BridgeResultLike>;
};

let resumableBridge: ResumableBridge | null = null;

async function createBridgeContext(
  source: FundingSource,
  explicitProvider?: EthereumProvider,
) {
  const selectedProvider =
    explicitProvider ?? getSelectedEthereumProvider();
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
  return {
    kit,
    adapter,
    provider: selectedProvider,
    sourceChain,
    destinationChain,
  };
}

function bridgeKey(source: FundingSource, amount: string, account: Address) {
  return `${source}:${amount}:${account.toLowerCase()}`;
}

async function switchToSourceNetwork(
  provider: EthereumProvider,
  source: FundingSource,
) {
  const option = fundingSources.find((candidate) => candidate.value === source);
  if (!option) throw new ArcBridgeError("The selected source network is unavailable.");
  const chainId = `0x${option.chainId.toString(16)}`;
  const current = await provider.request<string>({ method: "eth_chainId" });
  if (Number.parseInt(current, 16) === option.chainId) return option;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  } catch (switchError) {
    const code =
      typeof switchError === "object" && switchError !== null && "code" in switchError
        ? Number((switchError as { code: unknown }).code)
        : null;
    if (code !== 4902) throw switchError;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId,
          chainName: option.walletChain.name,
          nativeCurrency: option.walletChain.nativeCurrency,
          rpcUrls: [...option.walletChain.rpcUrls.default.http],
          blockExplorerUrls: option.walletChain.blockExplorers?.default
            ? [option.walletChain.blockExplorers.default.url]
            : [],
        },
      ],
    });
  }

  const active = await provider.request<string>({ method: "eth_chainId" });
  if (Number.parseInt(active, 16) !== option.chainId) {
    throw new ArcBridgeError(
      `The wallet did not finish switching to ${option.label}.`,
    );
  }
  return option;
}

async function verifySourceFunds(
  context: BridgeContext,
  source: FundingSource,
  amount: string,
  expectedAccount: Address,
) {
  const provider = context.provider;
  const option = await switchToSourceNetwork(provider, source);
  const accounts = await provider.request<string[]>({ method: "eth_accounts" });
  const activeAccount = accounts[0];
  if (!activeAccount || getAddress(activeAccount) !== getAddress(expectedAccount)) {
    throw new ArcBridgeError(
      "The active wallet account changed. Reconnect the agreement client wallet before bridging.",
    );
  }
  if (!context.sourceChain.usdcAddress) {
    throw new ArcBridgeError(`${option.label} does not expose testnet USDC.`);
  }

  const client = createPublicClient({
    chain: option.walletChain,
    transport: custom(provider),
  });
  const address = getAddress(activeAccount);
  const [usdcBalance, nativeBalance] = await Promise.all([
    client.readContract({
      address: getAddress(context.sourceChain.usdcAddress),
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    }),
    client.getBalance({ address }),
  ]);
  const required = parseUnits(amount, 6);
  if (usdcBalance < required) {
    throw new ArcBridgeError(
      `The source wallet has ${formatUnits(usdcBalance, 6)} USDC on ${option.label}, but this route requires ${amount} USDC. Choose Arc Testnet if the funds are already on Arc, or add testnet USDC to ${option.label}.`,
    );
  }
  if (nativeBalance === 0n) {
    throw new ArcBridgeError(
      `The source wallet needs ${option.walletChain.nativeCurrency.symbol} on ${option.label} for the network fee.`,
    );
  }
}

function assertBridgeSuccess(
  result: BridgeResultLike,
  context: BridgeContext,
  key: string,
) {
  if (result.state === "success") {
    resumableBridge = null;
    return result;
  }
  const failure = bridgeResultError(result, context.sourceChain.name);
  if (failure.canResume) {
    resumableBridge = {
      key,
      resume: async () =>
        context.kit.retryBridge(
          result as Parameters<typeof context.kit.retryBridge>[0],
          { from: context.adapter, to: context.adapter },
        ),
    };
  }
  throw failure;
}

export async function estimateArcBridge(
  source: FundingSource,
  amount: string,
  provider?: EthereumProvider,
): Promise<BridgeQuote> {
  const { kit, adapter, sourceChain, destinationChain } =
    await createBridgeContext(source, provider);
  const result = await kit.estimateBridge({
    from: { adapter, chain: sourceChain },
    to: { adapter, chain: destinationChain, useForwarder: true },
    amount,
    token: "USDC",
    config: { batchTransactions: false },
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
  account: Address,
  provider?: EthereumProvider,
) {
  if (source === "Arc_Testnet") {
    return { state: "success" as const, steps: 0 };
  }
  const key = bridgeKey(source, amount, account);
  if (resumableBridge?.key === key) {
    const context = await createBridgeContext(source, provider);
    let result: BridgeResultLike;
    try {
      result = await resumableBridge.resume();
    } catch (error) {
      throw new ArcBridgeError(
        formatArcBridgeError(error, context.sourceChain.name),
        true,
      );
    }
    return {
      state: assertBridgeSuccess(result, context, key).state,
      steps: result.steps.length,
    };
  }

  const context = await createBridgeContext(source, provider);
  await verifySourceFunds(context, source, amount, account);
  const { kit, adapter, sourceChain, destinationChain } = context;
  const result = await kit.bridge({
    from: { adapter, chain: sourceChain },
    to: { adapter, chain: destinationChain, useForwarder: true },
    amount,
    token: "USDC",
    config: { batchTransactions: false },
  });
  return {
    state: assertBridgeSuccess(result, context, key).state,
    steps: result.steps.length,
  };
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
