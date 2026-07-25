export const agreementStates = [
  "awaiting_funding",
  "active",
  "cancel_pending",
  "completed",
  "cancelled",
  "refunded",
] as const;

export type AgreementState = (typeof agreementStates)[number];

export const milestoneStates = [
  "pending",
  "in_progress",
  "submitted",
  "changes_requested",
  "released",
  "refunded",
] as const;

export type MilestoneState = (typeof milestoneStates)[number];

const agreementTransitions: Record<AgreementState, readonly AgreementState[]> = {
  awaiting_funding: ["active", "cancelled"],
  active: ["cancel_pending", "completed", "cancelled", "refunded"],
  cancel_pending: ["active", "cancelled", "refunded"],
  completed: [],
  cancelled: [],
  refunded: [],
};

const milestoneTransitions: Record<MilestoneState, readonly MilestoneState[]> = {
  pending: ["in_progress", "refunded"],
  in_progress: ["submitted", "refunded"],
  submitted: ["changes_requested", "released"],
  changes_requested: ["submitted", "refunded"],
  released: [],
  refunded: [],
};

export function canTransitionAgreement(
  from: AgreementState,
  to: AgreementState,
) {
  return agreementTransitions[from].includes(to);
}

export function canTransitionMilestone(
  from: MilestoneState,
  to: MilestoneState,
) {
  return milestoneTransitions[from].includes(to);
}

export function assertAgreementTransition(
  from: AgreementState,
  to: AgreementState,
) {
  if (!canTransitionAgreement(from, to)) {
    throw new Error(`Invalid agreement transition: ${from} -> ${to}`);
  }
}

export function assertMilestoneTransition(
  from: MilestoneState,
  to: MilestoneState,
) {
  if (!canTransitionMilestone(from, to)) {
    throw new Error(`Invalid milestone transition: ${from} -> ${to}`);
  }
}
