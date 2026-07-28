import {
  createPublicClient,
  createWalletClient,
  custom,
  erc20Abi,
  fallback,
  http,
  isAddress,
  parseAbi,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { ARC, ARC_CONTRACTS, arcTestnet } from "@/lib/arc/config";
import { getSelectedEthereumProvider } from "@/lib/wallet/selected-provider";

export const dueviaFactoryAbi = parseAbi([
  "error Unauthorized()",
  "error AgreementAlreadyDeployed()",
  "error InvalidConfiguration()",
  "event EscrowCreated(bytes32 indexed agreementRef, address indexed escrow, address indexed client, address provider, uint256 totalAmount)",
  "function usdc() view returns (address)",
  "function escrowByAgreement(bytes32 agreementRef) view returns (address escrow)",
  "function createEscrow((address client,address provider,bytes32 agreementRef,bytes32[] milestoneRefs,uint256[] amounts,uint64[] dueDates,uint32[] reviewWindows,uint8[] revisionLimits,uint64 nonDeliveryGracePeriod) config) returns (address escrowAddress)",
]);

export const dueviaEscrowAbi = parseAbi([
  "error Unauthorized()",
  "error InvalidState()",
  "error InvalidConfiguration()",
  "error NotCurrentMilestone()",
  "error ReviewWindowClosed()",
  "error DeadlineNotReached()",
  "error RevisionLimitReached()",
  "error WorkAlreadyStarted()",
  "error TokenTransferMismatch()",
  "event AgreementFunded(bytes32 indexed agreementRef, uint256 amount)",
  "event MilestoneStarted(bytes32 indexed agreementRef, uint256 indexed milestoneIndex)",
  "event MilestoneSubmitted(bytes32 indexed agreementRef, uint256 indexed milestoneIndex, bytes32 indexed submissionRef, uint64 reviewDeadline)",
  "event ChangesRequested(bytes32 indexed agreementRef, uint256 indexed milestoneIndex, uint8 revisionsUsed)",
  "event MilestoneReleased(bytes32 indexed agreementRef, uint256 indexed milestoneIndex, uint256 amount)",
  "event CancellationApproval(bytes32 indexed agreementRef, address indexed party, bool approved)",
  "event AgreementSettled(bytes32 indexed agreementRef, uint8 state, uint256 releasedAmount, uint256 refundedAmount)",
  "function state() view returns (uint8)",
  "function agreementRef() view returns (bytes32)",
  "function client() view returns (address)",
  "function provider() view returns (address)",
  "function currentMilestone() view returns (uint256)",
  "function totalAmount() view returns (uint256)",
  "function nonDeliveryGracePeriod() view returns (uint64)",
  "function milestoneCount() view returns (uint256)",
  "function getMilestone(uint256 index) view returns (bytes32 milestoneRef, uint256 amount, uint64 dueDate, uint32 reviewWindow, uint8 revisionLimit, uint8 revisionsUsed, uint64 submittedAt, uint8 state)",
  "function fund()",
  "function startCurrentMilestone()",
  "function submit(uint256 milestoneIndex, bytes32 submissionRef)",
  "function requestChanges(uint256 milestoneIndex)",
  "function approveAndRelease(uint256 milestoneIndex)",
  "function claimTimeoutRelease(uint256 milestoneIndex)",
  "function claimNonDeliveryRefund()",
  "function cancelBeforeWork()",
  "function approveMutualCancellation()",
  "function revokeCancellationApproval()",
]);

export type EscrowDeploymentConfig = {
  client: Address;
  provider: Address;
  agreementRef: Hex;
  milestoneRefs: Hex[];
  amounts: bigint[];
  dueDates: bigint[];
  reviewWindows: number[];
  revisionLimits: number[];
  nonDeliveryGracePeriod: bigint;
};

export function getDueviaFactoryAddress(): Address | null {
  const value = process.env.NEXT_PUBLIC_DUEVIA_FACTORY_ADDRESS;
  if (value) return isAddress(value) ? value : null;
  return ARC_CONTRACTS.dueviaFactory;
}

export function createDueviaPublicClient() {
  return createPublicClient({
    chain: arcTestnet,
    transport: fallback(
      ARC.readRpcUrls.map((url) =>
        http(url, { retryCount: 2, timeout: 8_000 }),
      ),
    ),
  });
}

function createDueviaWalletClient(account: Address) {
  const provider = getSelectedEthereumProvider();
  if (!provider) throw new Error("Choose and connect an EVM wallet first.");
  return createWalletClient({
    account,
    chain: arcTestnet,
    transport: custom(provider),
  });
}

async function sendAndWait(
  account: Address,
  request: Parameters<ReturnType<typeof createDueviaWalletClient>["writeContract"]>[0],
  onSubmitted?: (hash: Hex) => void,
) {
  const publicClient = createDueviaPublicClient();
  const simulation = await publicClient.simulateContract({
    ...request,
    account,
  } as Parameters<typeof publicClient.simulateContract>[0]);
  const wallet = createDueviaWalletClient(account);
  const hash = await wallet.writeContract(
    simulation.request as Parameters<typeof wallet.writeContract>[0],
  );
  onSubmitted?.(hash);
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    confirmations: 1,
    timeout: 90_000,
  });
  if (receipt.status !== "success") {
    throw new Error("The Arc transaction reverted.");
  }
  return receipt;
}

function contractErrorText(error: unknown, depth = 0): string {
  if (depth > 5 || typeof error !== "object" || error === null) return "";
  const candidate = error as {
    name?: unknown;
    message?: unknown;
    shortMessage?: unknown;
    details?: unknown;
    cause?: unknown;
    code?: unknown;
  };
  return [
    typeof candidate.name === "string" ? candidate.name : "",
    typeof candidate.shortMessage === "string" ? candidate.shortMessage : "",
    typeof candidate.details === "string" ? candidate.details : "",
    typeof candidate.message === "string" ? candidate.message : "",
    String(candidate.code ?? ""),
    contractErrorText(candidate.cause, depth + 1),
  ].join(" ");
}

export function formatContractError(
  error: unknown,
  fallback = "Arc could not prepare this transaction. Check the connected wallet, network, and testnet balance.",
) {
  const detail = contractErrorText(error).toLowerCase();
  if (detail.includes("agreementalreadydeployed")) {
    return "This agreement already has an Arc escrow. Reload the agreement before continuing.";
  }
  if (detail.includes("invalidconfiguration")) {
    return "The escrow terms are no longer valid. Check milestone dates, amounts, and both wallet addresses.";
  }
  if (detail.includes("unauthorized")) {
    return "Only the wallet assigned to this action can complete the transaction.";
  }
  if (detail.includes("insufficient funds")) {
    return "This wallet does not have enough Arc Testnet USDC for the amount and network fee.";
  }
  if (
    detail.includes("request limit reached") ||
    detail.includes("rate limit") ||
    detail.includes("too many requests")
  ) {
    return "Arc is temporarily busy. Your transaction may already be confirmed; wait a moment and continue to recover it automatically.";
  }
  if (detail.includes("network switch")) {
    return "The wallet did not finish switching to Arc Testnet. Switch networks in the wallet and try again.";
  }
  if (
    detail.includes("user rejected") ||
    detail.includes("user denied") ||
    detail.includes("cancelled") ||
    detail.includes("4001")
  ) {
    return "The wallet request was cancelled.";
  }
  if (detail.includes("invalidstate")) {
    return "This escrow action is not available in its current state. Reload the agreement.";
  }
  if (detail.includes("tokentransfermismatch")) {
    return "The USDC transfer did not match the agreement amount. Check the wallet balance and allowance.";
  }
  return fallback;
}

export async function deployAgreementEscrow(
  account: Address,
  config: EscrowDeploymentConfig,
) {
  const factoryAddress = getDueviaFactoryAddress();
  if (!factoryAddress) throw new Error("Duevia factory is not configured.");
  return sendAndWait(account, {
    address: factoryAddress,
    abi: dueviaFactoryAbi,
    functionName: "createEscrow",
    args: [config],
  });
}

export async function recoverAgreementEscrow(
  publicRef: string,
): Promise<Address | null> {
  const response = await fetch(`/api/agreements/${publicRef}/recover`, {
    method: "POST",
  });
  const payload = (await response.json()) as {
    contractAddress?: Address | null;
    message?: string;
  };
  if (!response.ok) {
    throw new Error(payload.message ?? "The existing Arc escrow could not be recovered.");
  }
  return payload.contractAddress ?? null;
}

export async function approveAgreementUsdc(
  account: Address,
  escrow: Address,
  amount: bigint,
) {
  return sendAndWait(account, {
    address: ARC_CONTRACTS.usdc,
    abi: erc20Abi,
    functionName: "approve",
    args: [escrow, amount],
  });
}

export type EscrowWriteAction =
  | { name: "fund"; args: [] }
  | { name: "startCurrentMilestone"; args: [] }
  | { name: "submit"; args: [bigint, Hex] }
  | { name: "requestChanges"; args: [bigint] }
  | { name: "approveAndRelease"; args: [bigint] }
  | { name: "claimTimeoutRelease"; args: [bigint] }
  | { name: "claimNonDeliveryRefund"; args: [] }
  | { name: "cancelBeforeWork"; args: [] }
  | { name: "approveMutualCancellation"; args: [] }
  | { name: "revokeCancellationApproval"; args: [] };

export async function writeEscrowAction(
  account: Address,
  escrow: Address,
  action: EscrowWriteAction,
  onSubmitted?: (hash: Hex) => void,
) {
  return sendAndWait(
    account,
    {
      address: escrow,
      abi: dueviaEscrowAbi,
      functionName: action.name,
      args: action.args,
    },
    onSubmitted,
  );
}

export async function readFundingState(
  account: Address,
  escrow: Address,
  totalAmount: bigint,
) {
  const client = createDueviaPublicClient();
  const [allowance, state] = await Promise.all([
    client.readContract({
      address: ARC_CONTRACTS.usdc,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account, escrow],
    }),
    client.readContract({
      address: escrow,
      abi: dueviaEscrowAbi,
      functionName: "state",
    }),
  ]);
  return {
    approved: allowance >= totalAmount,
    funded: state !== 0,
    state,
  };
}

export async function syncAgreementTransaction(
  publicRef: string,
  receipt: TransactionReceipt,
  submission?: {
    id: string;
    hash: Hex;
    note: string;
  },
  reviewNote?: string,
) {
  const response = await fetch(`/api/agreements/${publicRef}/sync`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      txHash: receipt.transactionHash,
      submission,
      reviewNote,
    }),
  });
  const payload = (await response.json()) as {
    event?: string;
    contractAddress?: Address;
    message?: string;
  };
  if (!response.ok) {
    throw new Error(payload.message ?? "The confirmed Arc transaction could not be synced.");
  }
  return payload;
}
