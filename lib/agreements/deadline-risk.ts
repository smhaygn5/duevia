export type DeadlineRiskInput = {
  dueAt: number;
  /**
   * When the review window of a submitted milestone closes (submittedAt plus
   * the review window). Submitted work is judged against this, never against
   * its delivery due date.
   */
  reviewClosesAt?: number | null;
  state: string;
  title: string;
  agreementRef: string;
  currentRole: "client" | "provider";
};

export type DeadlineRisk = DeadlineRiskInput & {
  level: "high" | "medium" | "low";
  label: string;
  action: string;
};

const openStates = new Set(["pending", "in_progress", "submitted", "changes_requested"]);

export function assessDeadlineRisk(input: DeadlineRiskInput, now = Date.now()): DeadlineRisk | null {
  if (!openStates.has(input.state)) return null;
  if (input.state === "submitted") return assessReviewRisk(input, now);
  const remaining = input.dueAt - now;
  const action = input.currentRole === "provider" ? "Prepare or update delivery" : "Review progress with provider";
  if (remaining < 0) return { ...input, level: "high", label: "Past due", action };
  if (remaining <= 48 * 60 * 60 * 1_000) return { ...input, level: "medium", label: "Due within 48 hours", action };
  return { ...input, level: "low", label: "Upcoming", action };
}

function assessReviewRisk(input: DeadlineRiskInput, now: number): DeadlineRisk {
  const action = input.currentRole === "provider" ? "Waiting for client review" : "Review the delivery before the window closes";
  if (typeof input.reviewClosesAt !== "number") {
    // Without review timing nothing can be called late. Delivery was already made.
    return { ...input, level: "low", label: "Awaiting review", action };
  }
  const remaining = input.reviewClosesAt - now;
  const base = { ...input, dueAt: input.reviewClosesAt, action };
  if (remaining < 0) return { ...base, level: "high", label: "Review window closed" };
  if (remaining <= 48 * 60 * 60 * 1_000) return { ...base, level: "medium", label: "Review closes within 48 hours" };
  return { ...base, level: "low", label: "Review open" };
}

export function deadlineRisks(inputs: DeadlineRiskInput[], now = Date.now()) {
  return inputs
    .map((input) => assessDeadlineRisk(input, now))
    .filter((risk): risk is DeadlineRisk => risk !== null)
    .sort((left, right) => left.dueAt - right.dueAt);
}
