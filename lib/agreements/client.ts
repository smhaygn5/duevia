import { getAddress, type Address, type Hex } from "viem";
import type { EscrowDeploymentConfig } from "@/lib/contracts/duevia";

export type AgreementRecord = {
  public_ref: string;
  contract_address: Address | null;
  agreement_hash: string;
  title: string;
  creator_role: "client" | "provider";
  current_role: "client" | "provider";
  client_address: Address | null;
  provider_address: Address | null;
  counterparty_name: string;
  currency: "USDC";
  total_amount_minor: string;
  total_amount: string;
  state: string;
  chain_id: number;
  funded_tx_hash: Hex | null;
  created_at: number;
  updated_at: number;
};

export type MilestoneRecord = {
  id: string;
  position: number;
  milestone_hash: string;
  title: string;
  description: string;
  amount_minor: string;
  amount: string;
  due_at: number;
  review_window_seconds: number;
  revision_limit: number;
  revisions_used: number;
  state: string;
  released_tx_hash: Hex | null;
};

export type ActivityRecord = {
  type: string;
  detail: string | null;
  tx_hash: Hex | null;
  occurred_at: number;
  milestone_position: number | null;
};

export type AgreementPayload = {
  agreement: AgreementRecord;
  milestones: MilestoneRecord[];
  activities: ActivityRecord[];
  submissions: Array<{
    id: string;
    milestone_id: string;
    milestone_position: number;
    submission_hash: Hex;
    note: string | null;
    submitted_at: number;
    tx_hash: Hex;
  }>;
  deliverables: Array<{
    id: string;
    submission_id: string;
    original_name: string;
    media_type: string;
    size_bytes: number;
    content_hash: string;
  }>;
};

export async function loadAgreement(publicRef: string): Promise<AgreementPayload> {
  const response = await fetch(`/api/agreements/${publicRef}`, {
    cache: "no-store",
  });
  const payload = (await response.json()) as AgreementPayload & {
    message?: string;
  };
  if (!response.ok || !payload.agreement || !payload.milestones) {
    throw new Error(payload.message ?? "Agreement could not be loaded.");
  }
  return payload;
}

export function getCurrentMilestone(milestones: MilestoneRecord[]) {
  return (
    milestones.find((milestone) =>
      ["submitted", "in_progress", "pending", "changes_requested"].includes(
        milestone.state,
      ),
    ) ?? milestones.at(-1)
  );
}

function proof(value: string): Hex {
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("A stored agreement proof is invalid.");
  }
  return normalized as Hex;
}

export function escrowConfigFromAgreement(
  payload: AgreementPayload,
): EscrowDeploymentConfig {
  const { agreement, milestones } = payload;
  if (!agreement.client_address || !agreement.provider_address) {
    throw new Error("Both parties must accept before escrow deployment.");
  }
  return {
    client: getAddress(agreement.client_address),
    provider: getAddress(agreement.provider_address),
    agreementRef: proof(agreement.agreement_hash),
    milestoneRefs: milestones.map((milestone) => proof(milestone.milestone_hash)),
    amounts: milestones.map((milestone) => BigInt(milestone.amount_minor)),
    dueDates: milestones.map((milestone) =>
      BigInt(Math.floor(milestone.due_at / 1_000)),
    ),
    reviewWindows: milestones.map(
      (milestone) => milestone.review_window_seconds,
    ),
    revisionLimits: milestones.map((milestone) => milestone.revision_limit),
    nonDeliveryGracePeriod: 2n * 24n * 60n * 60n,
  };
}
