export type DeliveryPulseMilestone = {
  dueAt: number | null;
  position: number;
  /** Review window length in seconds. Used with submittedAt once work is submitted. */
  reviewWindowSeconds?: number | null;
  status: string;
  /** When the current submission was recorded (ms). */
  submittedAt?: number | null;
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
  // Once work is submitted the delivery deadline no longer applies. The only
  // clock that matters is the review window, so a stage that was delivered on
  // time can never be reported as overdue because of its original due date.
  const isReview = active.status === "submitted";
  const deadline = isReview ? reviewClosesAt(active) : active.dueAt;
  if (deadline !== null) {
    const hoursUntilDue = Math.ceil((deadline - now) / 3_600_000);
    if (hoursUntilDue < 0) {
      const detail = isReview
        ? `${active.title} has been waiting past its review window. Confirm the agreement state before taking any action.`
        : `${active.title} is past its due date. Agree the next step with the counterparty.`;
      return { completionPercent, detail, label: `${mode} overdue`, releasedStages, tone: "urgent" };
    }
    if (hoursUntilDue <= 48) {
      return { completionPercent, detail: `${active.title} ${isReview ? "review window closes" : "is due"} within ${hoursUntilDue || 1} hour${hoursUntilDue === 1 ? "" : "s"}.`, label: `${mode} due soon`, releasedStages, tone: "attention" };
    }
  }

  if (isReview && deadline === null) {
    return { completionPercent, detail: `${active.title} is waiting for review.`, label: "Review in progress", releasedStages, tone: "healthy" };
  }

  return { completionPercent, detail: `${active.title} is the current stage.`, label: `${mode} on track`, releasedStages, tone: "healthy" };
}

function reviewClosesAt(milestone: DeliveryPulseMilestone) {
  if (typeof milestone.submittedAt !== "number" || typeof milestone.reviewWindowSeconds !== "number") return null;
  return milestone.submittedAt + milestone.reviewWindowSeconds * 1_000;
}
