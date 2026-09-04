"use client";

import { AlertTriangle, CalendarDays, CheckCircle2, Clock3 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { demoAgreement } from "@/lib/demo-data";
import { type DeadlineRisk } from "@/lib/agreements/deadline-risk";
import { filterScheduledMilestones, groupMilestonesByDate, type ScheduleFilter } from "@/lib/agreements/milestone-schedule";
import { loadVerifiedDashboard } from "@/lib/dashboard-client";
import { AppHeader } from "./app-header";
import { useWallet } from "./wallet-provider";

const demoSchedule: DeadlineRisk[] = [
  { agreementRef: demoAgreement.publicRef, title: "Product build", dueAt: Date.parse("2026-09-05T12:00:00.000Z"), state: "submitted", currentRole: "client", level: "medium", label: "Due within 48 hours", action: "Review the delivery package" },
  { agreementRef: demoAgreement.publicRef, title: "Launch handoff", dueAt: Date.parse("2026-09-12T12:00:00.000Z"), state: "pending", currentRole: "provider", level: "low", label: "Upcoming", action: "Prepare the next delivery" },
];
const emptySchedule: DeadlineRisk[] = [];

const filterLabels: Record<ScheduleFilter, string> = { all: "All milestones", attention: "Needs attention", upcoming: "Upcoming" };

function dateHeading(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" });
}

export function MilestoneSchedule() {
  const wallet = useWallet();
  const [filter, setFilter] = useState<ScheduleFilter>("all");
  const [result, setResult] = useState<{ address: string; items: DeadlineRisk[]; error: string | null } | null>(null);

  useEffect(() => {
    if (!wallet.authenticated || !wallet.address) return;
    let active = true;
    const address = wallet.address;
    void loadVerifiedDashboard()
      .then((dashboard) => { if (active) setResult({ address, items: dashboard.deadlineRisks, error: null }); })
      .catch((reason: unknown) => { if (active) setResult({ address, items: [], error: reason instanceof Error ? reason.message : "The schedule could not be loaded." }); });
    return () => { active = false; };
  }, [wallet.address, wallet.authenticated]);

  const current = wallet.authenticated && wallet.address === result?.address ? result : null;
  const source = wallet.authenticated ? current?.items ?? emptySchedule : demoSchedule;
  const groups = useMemo(() => groupMilestonesByDate(filterScheduledMilestones(source, filter)), [filter, source]);
  const loading = wallet.authenticated && !current;

  return <>
    <AppHeader eyebrow={wallet.authenticated ? "Arc workspace schedule" : "Demo workspace schedule"} title="Milestone Schedule" description={wallet.authenticated ? "A date ordered view of the delivery and review work across your agreements." : "A sample schedule showing when each protected milestone needs attention."} />
    {!wallet.authenticated && <div className="workspace-disclosure workspace-disclosure-demo"><strong>Guided demo · no real deadlines</strong><span>These entries are illustrative. Sign in to view the milestones stored in your own agreements.</span></div>}
    {wallet.authenticated && current?.error && <div className="workspace-disclosure workspace-disclosure-error"><strong>Schedule is temporarily unavailable</strong><span>{current.error}</span></div>}
    <section className="schedule-toolbar" aria-label="Schedule filters">
      <div>{(Object.keys(filterLabels) as ScheduleFilter[]).map((item) => <button key={item} type="button" className={filter === item ? "active" : ""} aria-pressed={filter === item} onClick={() => setFilter(item)}>{filterLabels[item]}</button>)}</div>
      <span>{loading ? "Loading schedule" : `${source.length} open ${source.length === 1 ? "milestone" : "milestones"}`}</span>
    </section>
    <section className="milestone-schedule" aria-label="Milestone schedule">
      {groups.map((group) => <div className="schedule-day" key={group.date}><header><CalendarDays size={16} /><h2>{dateHeading(group.date)}</h2><span>{group.items.length} item{group.items.length === 1 ? "" : "s"}</span></header><div>{group.items.map((item) => <Link href={`/app/agreements/${item.agreementRef.toLowerCase()}`} className={`schedule-item ${item.level}`} key={`${item.agreementRef}-${item.title}`}><span>{item.level === "high" ? <AlertTriangle size={17} /> : item.level === "medium" ? <Clock3 size={17} /> : <CheckCircle2 size={17} />}</span><div><small>{item.agreementRef} · {item.label}</small><strong>{item.title}</strong><p>{item.action}</p></div><time>{new Date(item.dueAt).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC</time></Link>)}</div></div>)}
      {!groups.length && <div className="empty-state">{loading ? "Loading your milestones…" : wallet.authenticated ? "No milestones match this schedule filter." : "No demo milestones match this schedule filter."}</div>}
    </section>
  </>;
}
