"use client";

import {
  ArrowDownToLine,
  CheckCircle2,
  Clock3,
  FileCheck2,
  Link2,
  LockKeyhole,
} from "lucide-react";
import { useMemo, useState } from "react";
import { AppHeader } from "./app-header";

const activities = [
  {
    id: "1",
    type: "delivery",
    icon: FileCheck2,
    title: "Product build submitted for review",
    detail: "Orbit Studio added 3 deliverables to DV-7K2P.",
    date: "Today · 10:42",
    agreement: "Global Product Launch",
    proof: null,
  },
  {
    id: "2",
    type: "settlement",
    icon: CheckCircle2,
    title: "Discovery & scope released",
    detail: "1,000 USDC settled to Orbit Studio on Arc.",
    date: "Jul 15 · 14:18",
    agreement: "Global Product Launch",
    proof:
      "0x7c03c77c2b0fb97875d231df3f90a4cc6dfad3b5633a0c733524192da16991f2",
  },
  {
    id: "3",
    type: "funding",
    icon: LockKeyhole,
    title: "Agreement funded",
    detail: "4,500 USDC locked in milestone escrow.",
    date: "Jul 8 · 09:31",
    agreement: "Global Product Launch",
    proof: null,
  },
  {
    id: "4",
    type: "agreement",
    icon: Link2,
    title: "Agreement accepted",
    detail: "Northstar Labs and Orbit Studio joined the same terms.",
    date: "Jul 7 · 18:06",
    agreement: "Global Product Launch",
    proof: null,
  },
  {
    id: "5",
    type: "settlement",
    icon: ArrowDownToLine,
    title: "Research sprint completed",
    detail: "Final 800 USDC settlement confirmed.",
    date: "Jun 28 · 12:04",
    agreement: "Research sprint",
    proof: null,
  },
] as const;

const filters = ["all", "agreement", "funding", "delivery", "settlement"] as const;

export function ActivityView() {
  const [filter, setFilter] = useState<(typeof filters)[number]>("all");
  const filtered = useMemo(
    () =>
      filter === "all"
        ? activities
        : activities.filter((activity) => activity.type === filter),
    [filter],
  );

  return (
    <>
      <AppHeader
        eyebrow="Audit trail"
        title="Activity"
        description="A readable timeline of agreements, delivery, and settlement proofs."
      />
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
                      View Arc proof
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
          <div className="empty-state">No events match this filter.</div>
        )}
      </section>
    </>
  );
}
