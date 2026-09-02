export type DeadlineRiskInput = {
  dueAt: number;
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
  const remaining = input.dueAt - now;
  const action = input.currentRole === "provider" ? "Prepare or update delivery" : "Review progress with provider";
  if (remaining < 0) return { ...input, level: "high", label: "Past due", action };
  if (remaining <= 48 * 60 * 60 * 1_000) return { ...input, level: "medium", label: "Due within 48 hours", action };
  return { ...input, level: "low", label: "Upcoming", action };
}

export function deadlineRisks(inputs: DeadlineRiskInput[], now = Date.now()) {
  return inputs
    .map((input) => assessDeadlineRisk(input, now))
    .filter((risk): risk is DeadlineRisk => risk !== null)
    .sort((left, right) => left.dueAt - right.dueAt);
}
