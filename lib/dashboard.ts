export type DashboardAgreementRow = {
  id: string;
  state: string;
};

export type DashboardMilestoneRow = {
  agreement_id: string;
  state: string;
  amount_minor: string;
};

export type DashboardActivityRow = {
  tx_hash: string | null;
};

export type DashboardSummary = {
  activeAgreements: number;
  totalAgreements: number;
  lockedMinor: string;
  releasedMinor: string;
  verifiedEvents: number;
};

const fundedAgreementStates = new Set(["active", "cancel_pending"]);
const unlockedMilestoneStates = new Set(["released", "refunded"]);

function minorAmount(value: string) {
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

export function computeDashboardSummary(
  agreements: DashboardAgreementRow[],
  milestones: DashboardMilestoneRow[],
  activities: DashboardActivityRow[],
): DashboardSummary {
  const agreementStates = new Map(
    agreements.map((agreement) => [agreement.id, agreement.state]),
  );
  let locked = 0n;
  let released = 0n;

  for (const milestone of milestones) {
    const amount = minorAmount(milestone.amount_minor);
    const agreementState = agreementStates.get(milestone.agreement_id);

    if (
      agreementState &&
      fundedAgreementStates.has(agreementState) &&
      !unlockedMilestoneStates.has(milestone.state)
    ) {
      locked += amount;
    }
    if (milestone.state === "released") {
      released += amount;
    }
  }

  return {
    activeAgreements: agreements.filter((agreement) =>
      fundedAgreementStates.has(agreement.state),
    ).length,
    totalAgreements: agreements.length,
    lockedMinor: locked.toString(),
    releasedMinor: released.toString(),
    verifiedEvents: activities.filter((activity) => activity.tx_hash).length,
  };
}
