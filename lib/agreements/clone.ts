export type CloneableMilestone = {
  title: string;
  description: string;
  amount: string;
  dueAt: number;
  reviewDays: number;
  revisionLimit: number;
  dependencyPosition?: number | null;
  acceptanceChecklist?: string[];
};

export type ClonedMilestoneDraft = Omit<CloneableMilestone, "dueAt" | "dependencyPosition" | "acceptanceChecklist"> & {
  dueDate: string;
  dependencyPosition?: number;
  acceptanceChecklist: string[];
};

function dateInputValue(value: Date) {
  return value.toISOString().slice(0, 10);
}

/**
 * Keeps the original cadence while starting a copied agreement with a future
 * first milestone. This prevents expired dates from silently carrying over.
 */
export function cloneMilestoneSchedule(
  milestones: CloneableMilestone[],
  now = new Date(),
): ClonedMilestoneDraft[] {
  if (!milestones.length) return [];

  const firstDueAt = milestones[0]!.dueAt;
  const firstNewDue = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 7, 12),
  ).getTime();

  return milestones.map((milestone) => ({
    title: milestone.title,
    description: milestone.description,
    amount: milestone.amount,
    dueDate: dateInputValue(
      new Date(firstNewDue + Math.max(0, milestone.dueAt - firstDueAt)),
    ),
    reviewDays: milestone.reviewDays,
    revisionLimit: milestone.revisionLimit,
    dependencyPosition: milestone.dependencyPosition ?? undefined,
    acceptanceChecklist: milestone.acceptanceChecklist ?? [milestone.description],
  }));
}
