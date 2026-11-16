export type DeliveryPulseMilestone = {
  dueAt: number | null;
  position: number;
  status: string;
  title: string;
};

export type DeliveryPulse = {
  completionPercent: number;
  detail: string;
  label: string;
  releasedStages: number;
  tone: "healthy" | "attention" | "urgent";
};

export function deliveryPulse(milestones: DeliveryPulseMilestone[], now = Date.now()): DeliveryPulse {
  const releasedStages = milestones.filter((milestone) => milestone.status === "released").length;
  const completionPercent = milestones.length ? Math.round((releasedStages / milestones.length) * 100) : 0;
  const active = milestones.find((milestone) => ["submitted", "in_progress", "pending", "changes_requested"].includes(milestone.status));

  if (!active) {
    return {
      completionPercent,
      detail: milestones.length ? "Every stage has reached a terminal settlement state." : "No milestones are recorded yet.",
      label: milestones.length ? "Settlement complete" : "Awaiting milestones",
      releasedStages,
      tone: "healthy",
    };
  }

  const mode = active.status === "submitted" ? "Review" : active.status === "changes_requested" ? "Revision" : "Delivery";
  if (active.dueAt !== null) {
    const hoursUntilDue = Math.ceil((active.dueAt - now) / 3_600_000);
    if (hoursUntilDue < 0) {
      return { completionPercent, detail: `${active.title} is past its due date. Agree the next step with the counterparty.`, label: `${mode} overdue`, releasedStages, tone: "urgent" };
    }
    if (hoursUntilDue <= 48) {
      return { completionPercent, detail: `${active.title} is due within ${hoursUntilDue || 1} hour${hoursUntilDue === 1 ? "" : "s"}.`, label: `${mode} due soon`, releasedStages, tone: "attention" };
    }
  }

  return { completionPercent, detail: `${active.title} is the current stage.`, label: `${mode} on track`, releasedStages, tone: "healthy" };
}
