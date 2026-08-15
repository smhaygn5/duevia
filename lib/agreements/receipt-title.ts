export function receiptTitle(type: string) {
  const titles: Record<string, string> = {
    "escrow.deployed": "Agreement escrow deployed",
    "agreement.funded": "Agreement funded",
    "milestone.started": "Milestone started",
    "milestone.submitted": "Milestone submitted",
    "milestone.changes_requested": "Changes requested",
    "milestone.released": "Milestone approved",
    "agreement.cancelled": "Agreement cancelled",
    "agreement.refunded": "Agreement refunded",
    "agreement.completed": "Agreement completed",
  };
  return titles[type] ?? "Arc transaction confirmed";
}

export function isSettlementReceipt(type: string) {
  return ["milestone.released", "agreement.refunded", "agreement.cancelled", "agreement.completed"].includes(type);
}
