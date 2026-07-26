"use client";

import {
  ArrowDownToLine,
  CheckCircle2,
  Clock3,
  FileCheck2,
  Link2,
  LockKeyhole,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";
import { AppHeader } from "./app-header";
import { useWallet } from "./wallet-provider";

type ActivityType =
  | "agreement"
  | "funding"
  | "delivery"
  | "settlement";

type DisplayActivity = {
  id: string;
  type: ActivityType;
  icon: LucideIcon;
  title: string;
  detail: string;
  date: string;
  agreement: string;
  proof: string | null;
};

type VerifiedActivity = {
  id: string;
  type: string;
  detail: Record<string, unknown>;
  tx_hash: string | null;
  occurred_at: number;
  agreement_ref: string;
  agreement_title: string;
};

const demoActivities: DisplayActivity[] = [
  {
    id: "1",
    type: "delivery",
    icon: FileCheck2,
    title: "Product build submitted for review",
    detail: "Orbit Studio added 3 sample deliverables to DV-7K2P.",
    date: "Sample · Today 10:42",
    agreement: "Global Product Launch",
    proof: null,
  },
  {
    id: "2",
    type: "settlement",
    icon: CheckCircle2,
    title: "Discovery & scope released",
    detail: "Sample settlement of 1,000 USDC to Orbit Studio.",
    date: "Sample · Jul 15 14:18",
    agreement: "Global Product Launch",
    proof: null,
  },
  {
    id: "3",
    type: "funding",
    icon: LockKeyhole,
    title: "Agreement funded",
    detail: "Sample funding of 4,500 USDC into milestone escrow.",
    date: "Sample · Jul 8 09:31",
    agreement: "Global Product Launch",
    proof: null,
  },
  {
    id: "4",
    type: "agreement",
    icon: Link2,
    title: "Agreement accepted",
    detail: "Northstar Labs and Orbit Studio joined the sample terms.",
    date: "Sample · Jul 7 18:06",
    agreement: "Global Product Launch",
    proof: null,
  },
] as const;

const filters = ["all", "agreement", "funding", "delivery", "settlement"] as const;

function minorUsdc(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    return Number(formatUnits(BigInt(value), 6)).toLocaleString("en-US", {
      maximumFractionDigits: 2,
    });
  } catch {
    return null;
  }
}

function describeActivity(activity: VerifiedActivity): DisplayActivity {
  const amount = minorUsdc(
    activity.detail.amountMinor ??
      activity.detail.releasedAmountMinor ??
      activity.detail.refundedAmountMinor,
  );
  const base = {
    id: activity.id,
    date: new Date(activity.occurred_at).toLocaleString("en", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }),
    agreement: `${activity.agreement_title} · ${activity.agreement_ref}`,
    proof: activity.tx_hash,
  };

  if (activity.type === "agreement.funded") {
    return {
      ...base,
      type: "funding",
      icon: LockKeyhole,
      title: "Agreement funded",
      detail: amount
        ? `${amount} USDC was verified as locked on Arc Testnet.`
        : "Funding was verified on Arc Testnet.",
    };
  }
  if (activity.type === "milestone.released") {
    return {
      ...base,
      type: "settlement",
      icon: ArrowDownToLine,
      title: "Milestone released",
      detail: amount
        ? `${amount} USDC was verified as released on Arc Testnet.`
        : "A milestone release was verified on Arc Testnet.",
    };
  }
  if (
    activity.type === "milestone.submitted" ||
    activity.type === "milestone.started" ||
    activity.type === "milestone.changes_requested"
  ) {
    const title = activity.type
      .replace("milestone.", "")
      .split("_")
      .map((word) => word[0]?.toUpperCase() + word.slice(1))
      .join(" ");
    return {
      ...base,
      type: "delivery",
      icon: FileCheck2,
      title: `Milestone ${title.toLowerCase()}`,
      detail: activity.tx_hash
        ? "This delivery state carries an Arc transaction proof."
        : "This delivery state is recorded in the private agreement timeline.",
    };
  }
  if (
    activity.type === "agreement.completed" ||
    activity.type === "agreement.refunded" ||
    activity.type === "agreement.cancelled"
  ) {
    const state = activity.type.replace("agreement.", "");
    return {
      ...base,
      type: "settlement",
      icon: CheckCircle2,
      title: `Agreement ${state}`,
      detail: activity.tx_hash
        ? "The final agreement state was verified on Arc Testnet."
        : "The final agreement state was recorded.",
    };
  }

  return {
    ...base,
    type: "agreement",
    icon: Link2,
    title: activity.type
      .replace(".", " ")
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase()),
    detail: activity.tx_hash
      ? "This agreement event carries an Arc transaction proof."
      : "This private agreement event is recorded offchain.",
  };
}

export function ActivityView() {
  const wallet = useWallet();
  const [filter, setFilter] = useState<(typeof filters)[number]>("all");
  const [result, setResult] = useState<{
    address: string;
    activities: DisplayActivity[];
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!wallet.authenticated || !wallet.address) return;

    let active = true;
    const address = wallet.address;
    void fetch("/api/dashboard", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as {
          activities?: VerifiedActivity[];
          message?: string;
        };
        if (!response.ok) {
          throw new Error(payload.message ?? "Unable to load activity.");
        }
        if (active) {
          setResult({
            address,
            activities: (payload.activities ?? []).map(describeActivity),
            error: null,
          });
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setResult({
            address,
            activities: [],
            error:
              reason instanceof Error
                ? reason.message
                : "Unable to load activity.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [wallet.address, wallet.authenticated]);

  const currentResult =
    wallet.authenticated && wallet.address === result?.address ? result : null;
  const verified = currentResult?.activities ?? [];
  const error = currentResult?.error ?? null;
  const loading = wallet.authenticated && !currentResult;
  const source = wallet.authenticated ? verified : demoActivities;
  const filtered = useMemo(
    () =>
      filter === "all"
        ? source
        : source.filter((activity) => activity.type === filter),
    [filter, source],
  );

  return (
    <>
      <AppHeader
        eyebrow={wallet.authenticated ? "Arc-verified audit trail" : "Demo audit trail"}
        title="Activity"
        description={
          wallet.authenticated
            ? "Your private agreement events, with Arc proofs where a transaction exists."
            : "A sample timeline showing how agreements, delivery, and settlement proofs work."
        }
      />
      {!wallet.authenticated && (
        <div className="workspace-disclosure workspace-disclosure-demo">
          <strong>Guided demo · no real activity</strong>
          <span>
            These events are illustrative. Sign in with an Arc Testnet wallet
            to see only your persisted and verified records.
          </span>
        </div>
      )}
      {wallet.authenticated && !loading && !error && (
        <div className="workspace-disclosure workspace-disclosure-verified">
          <strong>Private verified history</strong>
          <span>
            Explorer links appear only for events with a stored, verified Arc
            Testnet transaction hash.
          </span>
        </div>
      )}
      {loading && (
        <div className="workspace-disclosure">
          <strong>Loading verified activity</strong>
          <span>Reading your latest synchronized records.</span>
        </div>
      )}
      {error && (
        <div className="workspace-disclosure workspace-disclosure-error">
          <strong>Verified activity is temporarily unavailable</strong>
          <span>{error} Demo events are not being substituted.</span>
        </div>
      )}
      <div className="activity-filters" aria-label="Filter activity">
        {filters.map((item) => (
          <button
            type="button"
            className={filter === item ? "active" : ""}
            aria-pressed={filter === item}
            key={item}
            onClick={() => setFilter(item)}
          >
            {item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>
      <section className="panel activity-ledger">
        {filtered.length ? (
          filtered.map((activity) => {
            const Icon = activity.icon;
            return (
              <article key={activity.id}>
                <span className={`ledger-icon ${activity.type}`}>
                  <Icon size={18} />
                </span>
                <div>
                  <small>{activity.agreement}</small>
                  <h2>{activity.title}</h2>
                  <p>{activity.detail}</p>
                  {activity.proof && (
                    <a
                      href={`https://testnet.arcscan.app/tx/${activity.proof}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View verified Arc proof
                    </a>
                  )}
                </div>
                <time>
                  <Clock3 size={13} />
                  {activity.date}
                </time>
              </article>
            );
          })
        ) : (
          <div className="empty-state">
            {loading
              ? "Loading verified events…"
              : wallet.authenticated
                ? "No verified activity matches this filter."
                : "No demo events match this filter."}
          </div>
        )}
      </section>
    </>
  );
}
