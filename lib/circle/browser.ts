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
  http,
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
  fees: FundingFeeLine[];
  source: string;
  destination: string;
};

export type FundingFeeLine = {
  label: string;
  amount: string;
  detail?: string;
};

export type UnifiedBalance = {
  total: string;
  chains: number;
  breakdown: Array<{
    chain: string;
    confirmedBalance: string;
  }>;
};

export type BridgeReadiness = {
  source: string;
  usdc: string;
  native: string;
  usdcSufficient: boolean;
  gasAvailable: boolean;
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

type ResumableUnifiedSpend = {
  key: string;
  resume: () => Promise<{ txHash: string }>;
};

let resumableUnifiedSpend: ResumableUnifiedSpend | null = null;

type StoredUnifiedRecovery = {
  key: string;
  account: string;
  amount: string;
  attestation: string;
  signature: string;
  createdAt: number;
};

const unifiedRecoveryKey = "duevia:unified-spend-recovery:v1";

function readUnifiedRecovery(key: string) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(unifiedRecoveryKey);
    if (!raw) return null;
    const recovery = JSON.parse(raw) as StoredUnifiedRecovery;
    if (
      recovery.key !== key ||
      !recovery.attestation ||
      !recovery.signature ||
      Date.now() - recovery.createdAt > 6 * 60 * 60 * 1000
    ) {
      return null;
    }
    return recovery;
  } catch {
    return null;
  }
}

function storeUnifiedRecovery(recovery: StoredUnifiedRecovery) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(unifiedRecoveryKey, JSON.stringify(recovery));
  } catch {
    // The in-memory retry still works if browser storage is unavailable.
  }
}

function clearUnifiedRecovery() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(unifiedRecoveryKey);
  } catch {
    // Nothing to clear when browser storage is unavailable.
  }
}

function feeLabel(type: string) {
  switch (type) {
    case "provider":
      return "Circle provider fee";
    case "forwarder":
      return "Arc forwarding fee";
    case "kit":
      return "App Kit fee";
    case "gasFee":
      return "Gateway gas fee";
    default:
      return "Route fee";
  }
}

function formatFeeAmount(value: string | null | undefined, token: string) {
  if (!value) return "Estimate unavailable";
  return `${value} ${token}`;
}

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

async function createUnifiedBalanceContext(
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
    .getSupportedChains("unifiedBalance")
    .filter((chain): chain is Extract<ChainDefinition, { type: "evm" }> => {
      return chain.type === "evm" && chain.isTestnet;
    });
  const destinationChain = supportedChains.find(
    (chain) => chain.chain === "Arc_Testnet",
  );
  if (!destinationChain) {
    throw new Error(
      "Circle App Kit does not expose Arc Testnet for Unified Balance.",
    );
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

export async function checkArcBridgeReadiness(
  source: FundingSource,
  amount: string,
  account: Address,
  provider?: EthereumProvider,
): Promise<BridgeReadiness> {
  const context = await createBridgeContext(source, provider);
  const option = fundingSources.find((candidate) => candidate.value === source);
  if (!option || !context.sourceChain.usdcAddress) {
    throw new ArcBridgeError("The selected source network is unavailable.");
  }
  const client = createPublicClient({
    chain: option.walletChain,
    transport: http(option.walletChain.rpcUrls.default.http[0]),
  });
  const [usdcBalance, nativeBalance] = await Promise.all([
    client.readContract({
      address: getAddress(context.sourceChain.usdcAddress),
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account],
    }),
    client.getBalance({ address: account }),
  ]);
  return {
    source: option.label,
    usdc: formatUnits(usdcBalance, 6),
    native: formatUnits(nativeBalance, option.walletChain.nativeCurrency.decimals),
    usdcSufficient: usdcBalance >= parseUnits(amount, 6),
    gasAvailable: nativeBalance > 0n,
  };
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

function bridgeTransactionHashes(result: BridgeResultLike) {
  const source = result.steps.find(
    (step) => step.name === "burn" && step.state === "success",
  );
  const destination = result.steps.find(
    (step) => step.name === "mint" && step.state === "success",
  );
  return {
    sourceTxHash: source?.txHash ?? source?.transactionHash,
    destinationTxHash: destination?.txHash ?? destination?.transactionHash,
  };
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

  const fees: FundingFeeLine[] = [
    ...result.fees.map((fee) => ({
      label: feeLabel(fee.type),
      amount: formatFeeAmount(fee.amount, fee.token),
    })),
    ...result.gasFees.map((fee) => ({
      label: `${fee.name} gas`,
      amount:
        fee.fees && !fee.error
          ? `${formatUnits(BigInt(fee.fees.fee), 18)} ${fee.token}`
          : "Wallet estimate required",
      detail: String(fee.blockchain),
    })),
  ];

  return {
    amount: result.amount,
    fees,
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
    return {
      state: "success" as const,
      steps: 0,
      sourceTxHash: undefined,
      destinationTxHash: undefined,
    };
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
    const completed = assertBridgeSuccess(result, context, key);
    return {
      state: completed.state,
      steps: result.steps.length,
      ...bridgeTransactionHashes(result),
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
  const completed = assertBridgeSuccess(result, context, key);
  return {
    state: completed.state,
    steps: result.steps.length,
    ...bridgeTransactionHashes(result),
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

  const breakdown = result.breakdown.flatMap((account) =>
    account.breakdown
      .filter((entry) => Number(entry.confirmedBalance) > 0)
      .map((entry) => ({
        chain: entry.chain,
        confirmedBalance: entry.confirmedBalance,
      })),
  );

  return {
    total: result.totalConfirmedBalance,
    chains: breakdown.length,
    breakdown,
  };
}

export async function estimateUnifiedSpend(
  amount: string,
  provider?: EthereumProvider,
): Promise<BridgeQuote> {
  const { kit, adapter, destinationChain } =
    await createUnifiedBalanceContext(provider);
  const result = await kit.unifiedBalance.estimateSpend({
    amount,
    token: "USDC",
    from: { adapter },
    to: { adapter, chain: destinationChain },
  });

  return {
    amount,
    fees: result.fees.map((fee) => ({
      label: feeLabel(fee.type),
      amount: formatFeeAmount(fee.amount, fee.token),
    })),
    source: "Unified Balance",
    destination: "Arc_Testnet",
  };
}

function unifiedSpendKey(amount: string, account: Address) {
  return `${amount}:${account.toLowerCase()}`;
}

async function assertActiveAccount(
  provider: EthereumProvider,
  expectedAccount: Address,
) {
  const accounts = await provider.request<string[]>({ method: "eth_accounts" });
  const activeAccount = accounts[0];
  if (
    !activeAccount ||
    getAddress(activeAccount) !== getAddress(expectedAccount)
  ) {
    throw new ArcBridgeError(
      "The active wallet account changed. Reconnect the agreement client wallet before using Unified Balance.",
    );
  }
}

export async function executeUnifiedSpend(
  amount: string,
  account: Address,
  provider?: EthereumProvider,
) {
  const key = unifiedSpendKey(amount, account);
  if (resumableUnifiedSpend?.key === key) {
    const result = await resumableUnifiedSpend.resume();
    resumableUnifiedSpend = null;
    clearUnifiedRecovery();
    return result;
  }

  const context = await createUnifiedBalanceContext(provider);
  await assertActiveAccount(context.provider, account);

  const storedRecovery = readUnifiedRecovery(key);
  if (storedRecovery) {
    try {
      const result = await context.kit.unifiedBalance.spend({
        amount,
        token: "USDC",
        to: {
          adapter: context.adapter,
          chain: context.destinationChain,
        },
        config: {
          retry: {
            attestation: storedRecovery.attestation,
            signature: storedRecovery.signature,
          },
        },
      });
      clearUnifiedRecovery();
      return result;
    } catch (error) {
      throw new ArcBridgeError(
        formatArcBridgeError(error, "Circle Gateway"),
        true,
      );
    }
  }

  try {
    const result = await context.kit.unifiedBalance.spend({
      amount,
      token: "USDC",
      from: { adapter: context.adapter },
      to: {
        adapter: context.adapter,
        chain: context.destinationChain,
      },
    });
    resumableUnifiedSpend = null;
    clearUnifiedRecovery();
    return result;
  } catch (error) {
    const { isKitError } = await import("@circle-fin/app-kit");
    if (isKitError(error) && error.recoverability === "RESUMABLE") {
      const trace =
        typeof error.cause?.trace === "object" && error.cause.trace !== null
          ? (error.cause.trace as Record<string, unknown>)
          : null;
      const attestation =
        typeof trace?.attestation === "string" ? trace.attestation : null;
      const signature =
        typeof trace?.signature === "string" ? trace.signature : null;
      if (attestation && signature) {
        storeUnifiedRecovery({
          key,
          account,
          amount,
          attestation,
          signature,
          createdAt: Date.now(),
        });
        resumableUnifiedSpend = {
          key,
          resume: () =>
            context.kit.unifiedBalance.spend({
              amount,
              token: "USDC",
              to: {
                adapter: context.adapter,
                chain: context.destinationChain,
              },
              config: {
                retry: { attestation, signature },
              },
            }),
        };
        throw new ArcBridgeError(
          "The Gateway transfer was committed, but the Arc mint needs to be resumed. Use Resume Unified Balance; do not start a second transfer.",
          true,
        );
      }
    }
    throw error;
  }
}
