"use client";

import { AlertTriangle, BellRing, CheckCircle2, FileCheck2, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { demoAgreement } from "@/lib/demo-data";
import {
  sortActionCenterItems,
  type ActionCenterInput,
} from "@/lib/agreements/action-center";
import { loadVerifiedDashboard, type DashboardPayload } from "@/lib/dashboard-client";
import { AppHeader } from "./app-header";
import { useWallet } from "./wallet-provider";

const seenKey = "duevia-action-center-seen";

const demoItems: ActionCenterInput[] = [
  { id: "demo-review", type: "review", agreementRef: demoAgreement.publicRef, title: "Review Product build", detail: "A sample delivery package is ready for your review.", occurredAt: Date.parse("2026-08-16T10:42:00.000Z"), href: `/app/agreements/${demoAgreement.publicRef.toLowerCase()}/review` },
  { id: "demo-deadline", type: "deadline", agreementRef: "DV-9M1C", title: "Discovery brief is approaching", detail: "Sample milestone due within 48 hours.", occurredAt: Date.parse("2026-08-18T12:00:00.000Z"), href: "/app/agreements/dv-9m1c" },
];

function dashboardItems(dashboard: DashboardPayload): ActionCenterInput[] {
  const activityItems = dashboard.activities.flatMap<ActionCenterInput>((activity) => {
    const reviewHref = `/app/agreements/${activity.agreement_ref.toLowerCase()}/review`;
    if (activity.type === "milestone.submitted") {
      return [{ id: activity.id, type: "review" as const, agreementRef: activity.agreement_ref, title: "Milestone ready for review", detail: `${activity.agreement_title} has a submitted delivery package.`, occurredAt: activity.occurred_at, href: reviewHref }];
    }
    if (activity.type === "milestone.changes_requested") {
      return [{ id: activity.id, type: "revision" as const, agreementRef: activity.agreement_ref, title: "Changes requested", detail: `${activity.agreement_title} needs an updated delivery.`, occurredAt: activity.occurred_at, href: `/app/agreements/${activity.agreement_ref.toLowerCase()}/submit` }];
    }
    return [];
  });
  const riskItems = dashboard.deadlineRisks.map((risk) => ({
    id: `risk-${risk.agreementRef}-${risk.title}`,
    type: "deadline" as const,
    agreementRef: risk.agreementRef,
    title: risk.title,
    detail: `${risk.label} · ${risk.action}`,
    occurredAt: risk.dueAt,
    href: `/app/agreements/${risk.agreementRef.toLowerCase()}`,
  }));
  return sortActionCenterItems([...activityItems, ...riskItems]);
}

export function ActionCenter() {
  const wallet = useWallet();
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem(seenKey);
      return stored ? (JSON.parse(stored) as string[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (!wallet.authenticated) return;
    let active = true;
    void loadVerifiedDashboard().then(
      (result) => { if (active) setDashboard(result); },
      (reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load action items."); },
    );
    return () => { active = false; };
  }, [wallet.authenticated]);

  const items = useMemo(
    () => (wallet.authenticated ? (dashboard ? dashboardItems(dashboard) : []) : demoItems),
    [dashboard, wallet.authenticated],
  );
  const unread = items.filter((item) => !seen.includes(item.id)).length;

  function markSeen(id: string) {
    setSeen((current) => {
      const next = current.includes(id) ? current : [...current, id].slice(-100);
      try { localStorage.setItem(seenKey, JSON.stringify(next)); } catch { /* Local state still works. */ }
      return next;
    });
  }

  function markAllSeen() {
    const next = items.map((item) => item.id);
    setSeen(next);
    try { localStorage.setItem(seenKey, JSON.stringify(next)); } catch { /* Local state still works. */ }
  }

  return (
    <>
      <AppHeader eyebrow={wallet.authenticated ? "Workspace action center" : "Demo action center"} title="Action Center" description="The next actions that need attention across your agreements." action={items.length ? <button className="button button-secondary" type="button" onClick={markAllSeen}><CheckCircle2 size={16} /> Mark all seen</button> : undefined} />
      <div className={`workspace-disclosure ${wallet.authenticated ? "workspace-disclosure-verified" : "workspace-disclosure-demo"}`}><strong>{wallet.authenticated ? `${unread} unread action${unread === 1 ? "" : "s"}` : "Guided demo"}</strong><span>{wallet.authenticated ? "Items are derived from your saved agreements and verified Arc Testnet activity." : "These action items are sample data and do not represent real funds or work."}</span></div>
      {error && <div className="workspace-disclosure workspace-disclosure-error"><strong>Action items are temporarily unavailable</strong><span>{error}</span></div>}
      <section className="panel action-center-list">
        <header className="panel-header"><div><h2>Needs your attention</h2><p>Opening an item keeps its read status on this device.</p></div><BellRing size={19} /></header>
        <div>
          {items.map((item) => {
            const Icon = item.type === "review" ? FileCheck2 : item.type === "revision" ? RotateCcw : AlertTriangle;
            return <Link className={`action-center-row ${seen.includes(item.id) ? "seen" : ""}`} href={item.href} key={item.id} onClick={() => markSeen(item.id)}><span className={item.type}><Icon size={17} /></span><div><small>{item.agreementRef} · {item.type === "review" ? "Review" : item.type === "revision" ? "Revision" : "Deadline"}</small><strong>{item.title}</strong><p>{item.detail}</p></div>{!seen.includes(item.id) && <i aria-label="Unread action" />}</Link>;
          })}
          {!items.length && !error && <div className="risk-empty"><CheckCircle2 size={17} /> No action items need attention right now.</div>}
        </div>
      </section>
    </>
  );
}
