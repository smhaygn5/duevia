import type { DeadlineRisk } from "./deadline-risk";

export type AgreementHealth = {
  score: number;
  level: "healthy" | "attention" | "urgent";
  title: string;
  detail: string;
  signals: Array<{
    label: string;
    tone: "positive" | "neutral" | "warning" | "critical";
  }>;
};

/**
 * Produces a deliberately explainable workspace health indicator. It is an
 * operational aid, not a credit, payment, or risk score.
 */
export function assessAgreementHealth(input: {
  activeAgreements: number;
  deadlineRisks: Pick<DeadlineRisk, "level">[];
  settlementForecast: Array<{ label: string }>;
}): AgreementHealth {
  const overdue = input.deadlineRisks.filter((risk) => risk.level === "high").length;
  const nearDue = input.deadlineRisks.filter((risk) => risk.level === "medium").length;
  const upcoming = input.deadlineRisks.filter((risk) => risk.level === "low").length;
  const inReview = input.settlementForecast.filter((item) => item.label === "In review").length;
  const awaitingDelivery = input.settlementForecast.filter(
    (item) => item.label === "Awaiting delivery",
  ).length;

  const score = Math.max(0, 100 - overdue * 35 - nearDue * 14 - upcoming * 3);
  const level: AgreementHealth["level"] = overdue
    ? "urgent"
    : nearDue
      ? "attention"
      : "healthy";
  const title = overdue
    ? "Attention needed"
    : nearDue
      ? "Keep an eye on deadlines"
      : "Workspace is on track";
  const detail = overdue
    ? `${overdue} milestone${overdue === 1 ? " is" : "s are"} past due. Open the agreement to agree the next step.`
    : nearDue
      ? `${nearDue} milestone${nearDue === 1 ? " is" : "s are"} due within 48 hours. A quick check-in can prevent a delay.`
      : input.activeAgreements
        ? "No overdue or near-term milestones need action from you right now."
        : "Create an agreement when you are ready to start a protected workflow.";

  const signals: AgreementHealth["signals"] = [
    {
      label: overdue ? `${overdue} past due` : nearDue ? `${nearDue} due soon` : "No urgent deadlines",
      tone: overdue ? "critical" : nearDue ? "warning" : "positive",
    },
    {
      label: inReview ? `${inReview} release${inReview === 1 ? "" : "s"} in review` : "No release waiting for review",
      tone: inReview ? "neutral" : "positive",
    },
    {
      label: awaitingDelivery ? `${awaitingDelivery} delivery${awaitingDelivery === 1 ? "" : "ies"} in progress` : "Delivery queue clear",
      tone: awaitingDelivery ? "neutral" : "positive",
    },
  ];

  return { score, level, title, detail, signals };
}
