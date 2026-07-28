import {
  loadAgreement,
  type ActivityRecord,
  type AgreementPayload,
} from "@/lib/agreements/client";
import { computeDashboardSummary } from "@/lib/dashboard";

export type DashboardAgreement = {
  public_ref: string;
  title: string;
  state: string;
  total_amount_minor: string;
  counterparty_name: string;
  updated_at: number;
};

export type DashboardActivity = {
  id: string;
  type: string;
  detail: Record<string, unknown>;
  tx_hash: string | null;
  occurred_at: number;
  agreement_ref: string;
  agreement_title: string;
};

export type DashboardPayload = {
  source: "arc-verified";
  summary: {
    activeAgreements: number;
    totalAgreements: number;
    lockedMinor: string;
    releasedMinor: string;
    verifiedEvents: number;
  };
  agreements: DashboardAgreement[];
  activities: DashboardActivity[];
  updatedAt: number;
};

type AgreementListResponse = {
  agreements?: Array<{
    public_ref: string;
    title: string;
    state: string;
    total_amount_minor: string;
    counterparty_name: string;
    updated_at?: number;
  }>;
  message?: string;
};

function activityDetail(activity: ActivityRecord) {
  if (!activity.detail) return {};
  try {
    return JSON.parse(activity.detail) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function flattenActivities(payloads: AgreementPayload[]) {
  return payloads
    .flatMap((payload) =>
      payload.activities.map((activity, index) => ({
        id: `${payload.agreement.public_ref}-${activity.occurred_at}-${index}`,
        type: activity.type,
        detail: activityDetail(activity),
        tx_hash: activity.tx_hash,
        occurred_at: activity.occurred_at,
        agreement_ref: payload.agreement.public_ref,
        agreement_title: payload.agreement.title,
      })),
    )
    .sort((left, right) => right.occurred_at - left.occurred_at);
}

export function summarizeAgreementPayloads(
  payloads: AgreementPayload[],
): DashboardPayload["summary"] {
  const activities = payloads.flatMap((payload) => payload.activities);
  return computeDashboardSummary(
    payloads.map((payload) => ({
      id: payload.agreement.public_ref,
      state: payload.agreement.state,
    })),
    payloads.flatMap((payload) =>
      payload.milestones.map((milestone) => ({
        agreement_id: payload.agreement.public_ref,
        state: milestone.state,
        amount_minor: milestone.amount_minor,
      })),
    ),
    activities.map((activity) => ({ tx_hash: activity.tx_hash })),
  );
}

let dashboardCache:
  | {
      expiresAt: number;
      promise: Promise<DashboardPayload>;
    }
  | undefined;

async function requestVerifiedDashboard(): Promise<DashboardPayload> {
  const response = await fetch("/api/agreements", {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const list = (await response.json()) as AgreementListResponse;
  if (!response.ok || !list.agreements) {
    throw new Error(list.message ?? "Unable to load the verified workspace.");
  }

  const payloads = await Promise.all(
    list.agreements.map((agreement) => loadAgreement(agreement.public_ref)),
  );
  const activities = flattenActivities(payloads);

  return {
    source: "arc-verified",
    summary: summarizeAgreementPayloads(payloads),
    agreements: list.agreements.slice(0, 5).map((agreement) => ({
      ...agreement,
      updated_at: agreement.updated_at ?? 0,
    })),
    activities: activities.slice(0, 25),
    updatedAt: Math.max(
      0,
      ...payloads.map((payload) => payload.agreement.updated_at),
      ...activities.map((activity) => activity.occurred_at),
    ),
  };
}

export function loadVerifiedDashboard(): Promise<DashboardPayload> {
  if (dashboardCache && dashboardCache.expiresAt > Date.now()) {
    return dashboardCache.promise;
  }

  const promise = requestVerifiedDashboard().catch((error) => {
    if (dashboardCache?.promise === promise) dashboardCache = undefined;
    throw error;
  });
  dashboardCache = {
    expiresAt: Date.now() + 15_000,
    promise,
  };
  return promise;
}
