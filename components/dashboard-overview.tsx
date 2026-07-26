"use client";

import {
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  LockKeyhole,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";
import { demoAgreement, demoAgreements } from "@/lib/demo-data";
import { AppHeader } from "./app-header";
import { StatusBadge } from "./status-badge";
import { useWallet } from "./wallet-provider";

type DashboardAgreement = {
  public_ref: string;
  title: string;
  state: string;
  total_amount_minor: string;
  counterparty_name: string;
  updated_at: number;
};

type DashboardPayload = {
  source: "arc-verified";
  summary: {
    activeAgreements: number;
    totalAgreements: number;
    lockedMinor: string;
    releasedMinor: string;
    verifiedEvents: number;
  };
  agreements: DashboardAgreement[];
  updatedAt: number;
};

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
    void fetch("/api/dashboard", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as DashboardPayload & {
          message?: string;
        };
        if (!response.ok) {
          throw new Error(payload.message ?? "Unable to load the workspace.");
        }
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
