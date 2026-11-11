export type ActivityDigestInput = {
  type: string;
  title: string;
  txHash?: string | null;
};

export type AgreementActivityDigest = {
  recordedEvents: number;
  verifiedEvents: number;
  deliveryEvents: number;
  settlementEvents: number;
  latestEvent: string | null;
  summary: string;
};

const deliveryTypes = new Set([
  "milestone.started",
  "milestone.submitted",
  "milestone.changes_requested",
]);

const settlementTypes = new Set([
  "agreement.funded",
  "milestone.released",
  "agreement.refunded",
  "agreement.cancelled",
]);

export function agreementActivityDigest(
  activities: readonly ActivityDigestInput[],
): AgreementActivityDigest {
  const deliveryEvents = activities.filter((activity) => deliveryTypes.has(activity.type)).length;
  const settlementEvents = activities.filter((activity) => settlementTypes.has(activity.type)).length;
  const verifiedEvents = activities.filter((activity) => Boolean(activity.txHash)).length;

  let summary = "No agreement activity has been recorded yet.";
  if (activities.length) {
    const parts: string[] = [];
    if (deliveryEvents) parts.push(`${deliveryEvents} delivery update${deliveryEvents === 1 ? "" : "s"}`);
    if (settlementEvents) parts.push(`${settlementEvents} settlement event${settlementEvents === 1 ? "" : "s"}`);
    if (verifiedEvents) parts.push(`${verifiedEvents} Arc proof${verifiedEvents === 1 ? "" : "s"}`);
    summary = parts.length
      ? `Includes ${parts.join(" · ")}.`
      : `${activities.length} recorded agreement event${activities.length === 1 ? "" : "s"}.`;
  }

  return {
    recordedEvents: activities.length,
    verifiedEvents,
    deliveryEvents,
    settlementEvents,
    latestEvent: activities[0]?.title ?? null,
    summary,
  };
}
