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

export const dueviaFactoryAbi = parseAbi([
  "event EscrowCreated(bytes32 indexed agreementRef, address indexed escrow, address indexed client, address provider, uint256 totalAmount)",
  "function escrowByAgreement(bytes32 agreementRef) view returns (address escrow)",
  "function createEscrow((address client,address provider,bytes32 agreementRef,bytes32[] milestoneRefs,uint256[] amounts,uint64[] dueDates,uint32[] reviewWindows,uint8[] revisionLimits,uint64 nonDeliveryGracePeriod) config) returns (address escrowAddress)",
]);

export const dueviaEscrowAbi = parseAbi([
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
  "function milestones(uint256) view returns (bytes32 ref, uint256 amount, uint64 dueDate, uint32 reviewWindow, uint8 revisionLimit, uint8 revisionsUsed, bytes32 submissionRef, uint64 submittedAt, uint8 state)",
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
  return value && isAddress(value) ? value : null;
}

export function createDueviaPublicClient() {
  return createPublicClient({
    chain: arcTestnet,
    transport: fallback(
      ARC.rpcUrls.map((url) => http(url, { retryCount: 1, timeout: 8_000 })),
    ),
  });
}

function createDueviaWalletClient(account: Address) {
  if (!window.ethereum) throw new Error("Connect an EVM wallet first.");
  return createWalletClient({
    account,
    chain: arcTestnet,
    transport: custom(window.ethereum),
  });
}

async function sendAndWait(
  account: Address,
  request: Parameters<ReturnType<typeof createDueviaWalletClient>["writeContract"]>[0],
) {
  const wallet = createDueviaWalletClient(account);
  const hash = await wallet.writeContract(request);
  const receipt = await createDueviaPublicClient().waitForTransactionReceipt({
    hash,
    confirmations: 1,
    timeout: 90_000,
  });
  if (receipt.status !== "success") {
    throw new Error("The Arc transaction reverted.");
  }
  return receipt;
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
) {
  return sendAndWait(account, {
    address: escrow,
    abi: dueviaEscrowAbi,
    functionName: action.name,
    args: action.args,
  });
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
