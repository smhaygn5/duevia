export type FundingStepStatus = "active" | "complete" | "pending";

export function fundingStepStatuses(input: {
  prepared: boolean;
  transactionSubmitted: boolean;
  confirmed: boolean;
}): [FundingStepStatus, FundingStepStatus, FundingStepStatus] {
  if (input.confirmed) return ["complete", "complete", "complete"];
  if (input.transactionSubmitted) {
    return ["complete", "complete", "active"];
  }
  if (input.prepared) return ["complete", "active", "pending"];
  return ["active", "pending", "pending"];
}
