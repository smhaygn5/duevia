export type SettlementForecastInput = {
  agreementRef: string;
  agreementTitle: string;
  milestoneTitle: string;
  state: string;
  amountMinor: string;
  dueAt: number;
  reviewWindowSeconds: number;
  submittedAt?: number | null;
};

export type SettlementForecast = SettlementForecastInput & {
  releaseAt: number;
  label: "Awaiting delivery" | "In review" | "Revision requested";
};

export function settlementForecast(
  milestones: SettlementForecastInput[],
): SettlementForecast[] {
  return milestones
    .filter((milestone) => !["released", "cancelled", "recovered"].includes(milestone.state))
    .map((milestone) => {
      const inReview = milestone.state === "submitted" && milestone.submittedAt;
      const releaseAt =
        (inReview ? milestone.submittedAt! : milestone.dueAt) +
        milestone.reviewWindowSeconds * 1_000;
      const label: SettlementForecast["label"] = inReview
        ? "In review"
        : milestone.state === "changes_requested"
          ? "Revision requested"
          : "Awaiting delivery";
      return {
        ...milestone,
        releaseAt,
        label,
      };
    })
    .sort((left, right) => left.releaseAt - right.releaseAt);
}
