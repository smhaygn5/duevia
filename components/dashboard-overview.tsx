"use client";

import {
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  AlertTriangle,
  FileCheck2,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";
import { demoAgreement, demoAgreements } from "@/lib/demo-data";
import {
  loadVerifiedDashboard,
  type DashboardPayload,
} from "@/lib/dashboard-client";
import { AppHeader } from "./app-header";
import { StatusBadge } from "./status-badge";
import { useWallet } from "./wallet-provider";
import { assessAgreementHealth } from "@/lib/agreements/agreement-health";

function titleCase(value: string) {
  return value
    .split("_")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

function formatUsdc(minor: string) {
  const value = Number(formatUnits(BigInt(minor), 6));
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

const demoDeadlineRisks = [
  { agreementRef: demoAgreement.publicRef, title: "Product build", dueAt: Date.parse("2026-08-15T12:00:00.000Z"), level: "medium" as const, label: "Due within 48 hours", action: "Review progress with provider" },
  { agreementRef: "DV-9M1C", title: "Discovery brief", dueAt: Date.parse("2026-08-20T12:00:00.000Z"), level: "low" as const, label: "Upcoming", action: "Prepare or update delivery" },
];

const demoSettlementForecast = [
  { agreementRef: demoAgreement.publicRef, agreementTitle: "Global Product Launch", milestoneTitle: "Product build", amountMinor: "4500000000", releaseAt: Date.parse("2026-08-18T12:00:00.000Z"), label: "In review" },
  { agreementRef: "DV-9M1C", agreementTitle: "Brand foundation", milestoneTitle: "Discovery brief", amountMinor: "1800000000", releaseAt: Date.parse("2026-08-23T12:00:00.000Z"), label: "Awaiting delivery" },
];

export function DashboardOverview() {
  const wallet = useWallet();
  const [result, setResult] = useState<{
    address: string;
    dashboard: DashboardPayload | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!wallet.authenticated || !wallet.address) return;

    let active = true;
    const address = wallet.address;
    void loadVerifiedDashboard()
      .then((payload) => {
        if (active) {
          setResult({ address, dashboard: payload, error: null });
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setResult({
            address,
            dashboard: null,
            error:
              reason instanceof Error
                ? reason.message
                : "Unable to load the workspace.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [wallet.address, wallet.authenticated]);

  const currentResult =
    wallet.authenticated && wallet.address === result?.address ? result : null;
  const dashboard = currentResult?.dashboard ?? null;
  const error = currentResult?.error ?? null;
  const loading = wallet.authenticated && !currentResult;
  const isVerified = wallet.authenticated && Boolean(dashboard);
  const locked = isVerified
    ? formatUsdc(dashboard!.summary.lockedMinor)
    : "10,700";
  const released = isVerified
    ? formatUsdc(dashboard!.summary.releasedMinor)
    : "3,800";
  const settlementTotal =
    Number(locked.replaceAll(",", "")) + Number(released.replaceAll(",", ""));
  const lockedShare = settlementTotal
    ? Math.round((Number(locked.replaceAll(",", "")) / settlementTotal) * 100)
    : 0;
  const liveAgreements = useMemo(
    () =>
      dashboard?.agreements.map((agreement) => ({
        publicRef: agreement.public_ref,
        title: agreement.title,
        counterparty: agreement.counterparty_name,
        total: formatUsdc(agreement.total_amount_minor),
        status: titleCase(agreement.state),
      })) ?? [],
    [dashboard],
  );
  const displayAgreements = isVerified
    ? liveAgreements
    : demoAgreements.map((agreement) => ({
        publicRef: agreement.publicRef,
        title: agreement.title,
        counterparty:
          agreement.provider === "Orbit Studio"
            ? agreement.client
            : agreement.provider,
        total: agreement.total,
        status: agreement.status,
      }));
  const health = assessAgreementHealth({
    activeAgreements: isVerified ? dashboard!.summary.activeAgreements : 2,
    deadlineRisks: isVerified ? dashboard!.deadlineRisks : demoDeadlineRisks,
    settlementForecast: isVerified
      ? dashboard!.settlementForecast
      : demoSettlementForecast,
  });

  return (
    <>
      <AppHeader
        eyebrow={isVerified ? "Arc-verified workspace" : "Duevia demo workspace"}
        title="Good morning"
        description={
          isVerified
            ? "Your saved agreements and verified Arc Testnet activity."
            : "Explore a complete milestone escrow journey with sample, no-value data."
        }
        action={
          <Link className="button button-primary" href="/app/agreements/new">
            Create agreement
          </Link>
        }
      />

      {!wallet.authenticated && (
        <div className="workspace-disclosure workspace-disclosure-demo">
          <strong>Guided demo · no real funds</strong>
          <span>
            Every company, agreement, balance, date, and transaction shown in
            this workspace is sample data for the Arc Testnet product walkthrough.
          </span>
        </div>
      )}
      {isVerified && (
        <div className="workspace-disclosure workspace-disclosure-verified">
          <strong>Arc-verified workspace</strong>
          <span>
            Totals come from your stored agreements and transaction states
            verified against Arc Testnet.
          </span>
        </div>
      )}
      {wallet.authenticated && loading && (
        <div className="workspace-disclosure">
          <strong>Loading verified workspace</strong>
          <span>Reading your latest synchronized Arc Testnet records.</span>
        </div>
      )}
      {wallet.authenticated && error && (
        <div className="workspace-disclosure workspace-disclosure-error">
          <strong>Verified data is temporarily unavailable</strong>
          <span>{error} No demo totals are being substituted.</span>
        </div>
      )}

      {!wallet.authenticated && (
        <section className="attention-card">
          <div className="attention-icon">
            <Clock3 size={21} />
          </div>
          <div>
            <span>Demo action</span>
            <h2>Review milestone 02 · Product build</h2>
            <p>
              Orbit Studio submitted 3 sample deliverables. The simulated
              review window closes in {demoAgreement.reviewDeadline}.
            </p>
          </div>
          <Link
            className="button button-primary"
            href={`/app/agreements/${demoAgreement.publicRef.toLowerCase()}/review`}
          >
            Review demo
            <ArrowRight size={16} />
          </Link>
        </section>
      )}

      {isVerified && (
        <section className="attention-card">
          <div className="attention-icon">
            <CheckCircle2 size={21} />
          </div>
          <div>
            <span>Verified state</span>
            <h2>
              {dashboard!.summary.totalAgreements
                ? `${dashboard!.summary.totalAgreements} agreement${dashboard!.summary.totalAgreements === 1 ? "" : "s"} synchronized`
                : "Your real workspace is ready"}
            </h2>
            <p>
              {dashboard!.summary.totalAgreements
                ? `${dashboard!.summary.verifiedEvents} activity records carry an Arc transaction proof.`
                : "Create an agreement to start a real Arc Testnet workflow."}
            </p>
          </div>
          <Link className="button button-primary" href="/app/agreements">
            View agreements
            <ArrowRight size={16} />
          </Link>
        </section>
      )}

      {(!wallet.authenticated || isVerified) && (
        <>
          <section className={`panel agreement-health ${health.level}`} aria-label="Agreement health">
            <div className="agreement-health-score" aria-label={`${health.score} out of 100`}>
              <span>{health.score}</span>
              <small>health</small>
            </div>
            <div className="agreement-health-copy">
              <div className="agreement-health-kicker"><ShieldCheck size={15} /> Agreement health</div>
              <h2>{health.title}</h2>
              <p>{health.detail}</p>
            </div>
            <div className="agreement-health-signals" aria-label="Health signals">
              {health.signals.map((signal) => (
                <span className={signal.tone} key={signal.label}>{signal.label}</span>
              ))}
            </div>
          </section>
          <section className="panel deadline-risk-center">
            <header className="panel-header">
              <div>
                <h2>Deadline & risk center</h2>
                <p>{isVerified ? "Upcoming milestones and the next action for your role." : "A sample view of the deadlines that need attention."}</p>
              </div>
              <span className="risk-count">{isVerified ? dashboard!.deadlineRisks.length : 2} open</span>
            </header>
            <div className="risk-list">
              {(isVerified ? dashboard!.deadlineRisks : demoDeadlineRisks).map((risk) => (
                <Link className={`risk-row ${risk.level}`} key={`${risk.agreementRef}-${risk.title}`} href={`/app/agreements/${risk.agreementRef.toLowerCase()}`}>
                  <span className="risk-icon"><AlertTriangle size={15} /></span>
                  <div><small>{risk.agreementRef} · {risk.label}</small><strong>{risk.title}</strong><p>{risk.action}</p></div>
                  <time>{new Date(risk.dueAt).toLocaleDateString("en", { month: "short", day: "numeric" })}</time>
                  <ArrowRight size={15} />
                </Link>
              ))}
              {isVerified && !dashboard!.deadlineRisks.length && <div className="risk-empty"><CheckCircle2 size={16} /> No active milestone deadlines need attention.</div>}
            </div>
          </section>
          <section className="panel settlement-forecast-panel">
            <header className="panel-header">
              <div>
                <h2>Settlement forecast</h2>
                <p>{isVerified ? "Expected release windows from your active milestones." : "Sample release windows from the demo workflow."}</p>
              </div>
              <Clock3 size={18} />
            </header>
            <div className="settlement-forecast-list">
              {(isVerified ? dashboard!.settlementForecast : demoSettlementForecast).map((item) => (
                <Link className="settlement-forecast-row" key={`${item.agreementRef}-${item.milestoneTitle}`} href={`/app/agreements/${item.agreementRef.toLowerCase()}`}>
                  <span className={item.label === "In review" ? "forecast-state review" : "forecast-state"}><Clock3 size={15} /></span>
                  <div><small>{item.agreementRef} · {item.label}</small><strong>{item.milestoneTitle}</strong><p>{item.agreementTitle}</p></div>
                  <div className="forecast-amount"><strong>{formatUsdc(item.amountMinor)} USDC</strong><small>Expected {new Date(item.releaseAt).toLocaleDateString("en", { month: "short", day: "numeric" })}</small></div>
                  <ArrowRight size={15} />
                </Link>
              ))}
              {isVerified && !dashboard!.settlementForecast.length && <div className="risk-empty"><CheckCircle2 size={16} /> No upcoming settlement windows.</div>}
            </div>
          </section>
          <section className="metric-grid" aria-label="Workspace summary">
            <article className="metric-card">
              <span className="metric-icon">
                <FileCheck2 size={18} />
              </span>
              <p>Active agreements</p>
              <strong>
                {isVerified ? dashboard!.summary.activeAgreements : "2"}
              </strong>
              <small>
                {isVerified
                  ? `${dashboard!.summary.totalAgreements} total in your workspace`
                  : "Sample client and provider roles"}
              </small>
            </article>
            <article className="metric-card">
              <span className="metric-icon">
                <LockKeyhole size={18} />
              </span>
              <p>Locked in escrow</p>
              <strong>{locked} USDC</strong>
              <small>
                {isVerified
                  ? "From funded, unreleased milestones"
                  : "Sample Arc Testnet balance"}
              </small>
            </article>
            <article className="metric-card">
              <span className="metric-icon">
                <CircleDollarSign size={18} />
              </span>
              <p>Released</p>
              <strong>{released} USDC</strong>
              <small>
                {isVerified
                  ? "From released milestones"
                  : "Sample completed settlements"}
              </small>
            </article>
            <article className="metric-card">
              <span className="metric-icon success">
                <CheckCircle2 size={18} />
              </span>
              <p>Verified events</p>
              <strong>
                {isVerified ? dashboard!.summary.verifiedEvents : "4"}
              </strong>
              <small>
                {isVerified
                  ? "Activities with an Arc transaction proof"
                  : "Illustrative demo events"}
              </small>
            </article>
          </section>

          <section className="dashboard-grid">
            <article className="panel agreements-panel">
              <header className="panel-header">
                <div>
                  <h2>{isVerified ? "Your agreements" : "Demo agreements"}</h2>
                  <p>
                    {isVerified
                      ? "Your latest persisted agreement records."
                      : "Sample milestones, funds, and next actions."}
                  </p>
                </div>
                <Link className="text-link" href="/app/agreements">
                  View all
                </Link>
              </header>
              <div className="agreement-table" role="table">
                {displayAgreements.map((agreement) => (
                  <Link
                    role="row"
                    className="agreement-table-row"
                    key={agreement.publicRef}
                    href={`/app/agreements/${agreement.publicRef.toLowerCase()}`}
                  >
                    <div role="cell">
                      <strong>{agreement.title}</strong>
                      <span>{agreement.publicRef}</span>
                    </div>
                    <div role="cell">
                      <span>Counterparty</span>
                      <strong>{agreement.counterparty}</strong>
                    </div>
                    <div role="cell">
                      <span>Total</span>
                      <strong>{agreement.total} USDC</strong>
                    </div>
                    <StatusBadge status={agreement.status} />
                    <ArrowRight size={16} />
                  </Link>
                ))}
                {isVerified && !liveAgreements.length && (
                  <div className="empty-state">
                    No real agreements yet. Create one to start the Arc Testnet
                    flow.
                  </div>
                )}
              </div>
            </article>

            <article className="panel balance-panel">
              <header className="panel-header">
                <div>
                  <h2>Settlement balance</h2>
                  <p>Arc Testnet</p>
                </div>
                <span className="pill pill-live">
                  {isVerified ? "Arc verified" : "Demo"}
                </span>
              </header>
              <div className="balance-orbit">
                <div>
                  <span>Locked</span>
                  <strong>{locked}</strong>
                  <small>USDC</small>
                </div>
              </div>
              <div className="balance-legend">
                <span>
                  <i className="legend-locked" />
                  Locked · {lockedShare}%
                </span>
                <span>
                  <i className="legend-released" />
                  Released · {100 - lockedShare}%
                </span>
              </div>
            </article>
          </section>
        </>
      )}
    </>
  );
}
