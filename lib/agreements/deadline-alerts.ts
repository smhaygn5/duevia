import type { DeadlineRisk } from "./deadline-risk";

export type DeadlineAlert = {
  body: string;
  id: string;
  title: string;
};

type AlertableDeadlineRisk = Pick<DeadlineRisk, "action" | "agreementRef" | "dueAt" | "label" | "level" | "title">;

export function deadlineAlerts(risks: AlertableDeadlineRisk[], preference: "important" | "all" | "none"): DeadlineAlert[] {
  if (preference === "none") return [];
  const visible = preference === "all" ? risks : risks.filter((risk) => risk.level === "high" || risk.level === "medium");
  return visible.slice(0, 3).map((risk) => ({
    body: `${risk.agreementRef} · ${risk.action}`,
    id: `${risk.agreementRef}:${risk.title}:${risk.dueAt}:${risk.level}`,
    title: `${risk.label}: ${risk.title}`,
  }));
}
