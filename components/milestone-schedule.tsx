"use client";

import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, Download } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { demoAgreement } from "@/lib/demo-data";
import { type DeadlineRisk } from "@/lib/agreements/deadline-risk";
import { filterScheduledMilestones, filterScheduleWindow, groupMilestonesByDate, type ScheduleFilter, type ScheduleWindow } from "@/lib/agreements/milestone-schedule";
import { loadVerifiedDashboard } from "@/lib/dashboard-client";
import { AppHeader } from "./app-header";
import { useWallet } from "./wallet-provider";
import { formatWorkspaceDate, formatWorkspaceTime, loadWorkspacePreferences, preferencesChangedEvent, type TimeReference } from "@/lib/workspace-preferences";
import { milestoneScheduleCalendar } from "@/lib/agreements/schedule-calendar";

const demoSchedule: DeadlineRisk[] = [
  { agreementRef: demoAgreement.publicRef, title: "Product build", dueAt: Date.parse("2026-09-05T12:00:00.000Z"), state: "submitted", currentRole: "client", level: "medium", label: "Due within 48 hours", action: "Review the delivery package" },
  { agreementRef: demoAgreement.publicRef, title: "Launch handoff", dueAt: Date.parse("2026-09-12T12:00:00.000Z"), state: "pending", currentRole: "provider", level: "low", label: "Upcoming", action: "Prepare the next delivery" },
];
const emptySchedule: DeadlineRisk[] = [];

const filterLabels: Record<ScheduleFilter, string> = { all: "All milestones", attention: "Needs attention", upcoming: "Upcoming" };
const windowLabels: Record<ScheduleWindow, string> = { all: "Any time", next: "Next 7 days", following: "Following 7 days", later: "Later" };

function subscribeToPreferences(onStoreChange: () => void) {
  window.addEventListener(preferencesChangedEvent, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => { window.removeEventListener(preferencesChangedEvent, onStoreChange); window.removeEventListener("storage", onStoreChange); };
}

function timeReferenceSnapshot(): TimeReference {
  return loadWorkspacePreferences().timeReference;
}

export function MilestoneSchedule() {
  const wallet = useWallet();
  const timeReference = useSyncExternalStore<TimeReference>(subscribeToPreferences, timeReferenceSnapshot, () => "utc");
  const [filter, setFilter] = useState<ScheduleFilter>("all");
  const [windowFilter, setWindowFilter] = useState<ScheduleWindow>("all");
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
  const scheduleItems = useMemo(() => filterScheduleWindow(filterScheduledMilestones(source, filter), windowFilter), [filter, source, windowFilter]);
  const groups = useMemo(() => groupMilestonesByDate(scheduleItems), [scheduleItems]);
  const loading = wallet.authenticated && !current;

  function downloadCalendar() {
    const calendar = milestoneScheduleCalendar(scheduleItems);
    const blob = new Blob([calendar], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "duevia-milestones.ics";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return <>
    <AppHeader eyebrow={wallet.authenticated ? "Arc workspace schedule" : "Demo workspace schedule"} title="Milestone Schedule" description={wallet.authenticated ? "A date ordered view of the delivery and review work across your agreements." : "A sample schedule showing when each protected milestone needs attention."} action={<button type="button" className="button button-quiet schedule-export" onClick={downloadCalendar} disabled={!scheduleItems.length}><Download size={16} /> Export calendar</button>} />
    {!wallet.authenticated && <div className="workspace-disclosure workspace-disclosure-demo"><strong>Guided demo · no real deadlines</strong><span>These entries are illustrative. Sign in to view the milestones stored in your own agreements.</span></div>}
    {wallet.authenticated && current?.error && <div className="workspace-disclosure workspace-disclosure-error"><strong>Schedule is temporarily unavailable</strong><span>{current.error}</span></div>}
    <section className="schedule-toolbar" aria-label="Schedule filters">
      <div>{(Object.keys(filterLabels) as ScheduleFilter[]).map((item) => <button key={item} type="button" className={filter === item ? "active" : ""} aria-pressed={filter === item} onClick={() => setFilter(item)}>{filterLabels[item]}</button>)}</div>
      <div className="schedule-window-tabs" role="group" aria-label="Filter milestones by time window">{(Object.keys(windowLabels) as ScheduleWindow[]).map((item) => <button key={item} type="button" className={windowFilter === item ? "active" : ""} aria-pressed={windowFilter === item} onClick={() => setWindowFilter(item)}>{windowLabels[item]}</button>)}</div>
      <span>{loading ? "Loading schedule" : `${scheduleItems.length} open ${scheduleItems.length === 1 ? "milestone" : "milestones"} · ${timeReference === "utc" ? "UTC" : "Local time"}`}</span>
    </section>
    <section className="milestone-schedule" aria-label="Milestone schedule">
      {groups.map((group) => <div className="schedule-day" key={group.date}><header><CalendarDays size={16} /><h2>{formatWorkspaceDate(group.date, timeReference)}</h2><span>{group.items.length} item{group.items.length === 1 ? "" : "s"}</span></header><div>{group.items.map((item) => <Link href={`/app/agreements/${item.agreementRef.toLowerCase()}`} className={`schedule-item ${item.level}`} key={`${item.agreementRef}-${item.title}`}><span>{item.level === "high" ? <AlertTriangle size={17} /> : item.level === "medium" ? <Clock3 size={17} /> : <CheckCircle2 size={17} />}</span><div><small>{item.agreementRef} · {item.label}</small><strong>{item.title}</strong><p>{item.action}</p></div><time>{formatWorkspaceTime(item.dueAt, timeReference)} {timeReference === "utc" ? "UTC" : "local"}</time></Link>)}</div></div>)}
      {!groups.length && <div className="empty-state">{loading ? "Loading your milestones…" : wallet.authenticated ? "No milestones match this schedule filter." : "No demo milestones match this schedule filter."}</div>}
    </section>
  </>;
}
