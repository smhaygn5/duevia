import {
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  LockKeyhole,
} from "lucide-react";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { StatusBadge } from "@/components/status-badge";
import { demoAgreement, demoAgreements } from "@/lib/demo-data";

export const metadata = {
  title: "Overview",
};

export default function OverviewPage() {
  return (
    <>
      <AppHeader
        eyebrow="Duevia workspace"
        title="Good morning"
        description="Here’s what needs your attention across your global agreements."
        action={
          <Link className="button button-primary" href="/app/agreements/new">
            Create agreement
          </Link>
        }
      />

      <section className="attention-card">
        <div className="attention-icon">
          <Clock3 size={21} />
        </div>
        <div>
          <span>Action required</span>
          <h2>Review milestone 02 · Product build</h2>
          <p>
            Orbit Studio submitted 3 deliverables. The review window closes in{" "}
            {demoAgreement.reviewDeadline}.
          </p>
        </div>
        <Link
          className="button button-primary"
          href={`/app/agreements/${demoAgreement.publicRef.toLowerCase()}/review`}
        >
          Review delivery
          <ArrowRight size={16} />
        </Link>
      </section>

      <section className="metric-grid" aria-label="Workspace summary">
        <article className="metric-card">
          <span className="metric-icon">
            <FileCheck2 size={18} />
          </span>
          <p>Active agreements</p>
          <strong>2</strong>
          <small>Across client and provider roles</small>
        </article>
        <article className="metric-card">
          <span className="metric-icon">
            <LockKeyhole size={18} />
          </span>
          <p>Locked in escrow</p>
          <strong>10,700 USDC</strong>
          <small>Protected on Arc Testnet</small>
        </article>
        <article className="metric-card">
          <span className="metric-icon">
            <CircleDollarSign size={18} />
          </span>
          <p>Released</p>
          <strong>3,800 USDC</strong>
          <small>Across completed milestones</small>
        </article>
        <article className="metric-card">
          <span className="metric-icon success">
            <CheckCircle2 size={18} />
          </span>
          <p>Completion rate</p>
          <strong>100%</strong>
          <small>No overdue settlement actions</small>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="panel agreements-panel">
          <header className="panel-header">
            <div>
              <h2>Recent agreements</h2>
              <p>Milestones, funds, and next actions in one view.</p>
            </div>
            <Link className="text-link" href="/app/agreements">
              View all
            </Link>
          </header>
          <div className="agreement-table" role="table">
            {demoAgreements.map((agreement) => (
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
                  <strong>
                    {agreement.provider === "Orbit Studio"
                      ? agreement.client
                      : agreement.provider}
                  </strong>
                </div>
                <div role="cell">
                  <span>Total</span>
                  <strong>{agreement.total} USDC</strong>
                </div>
                <StatusBadge status={agreement.status} />
                <ArrowRight size={16} />
              </Link>
            ))}
          </div>
        </article>

        <article className="panel balance-panel">
          <header className="panel-header">
            <div>
              <h2>Settlement balance</h2>
              <p>Arc Testnet</p>
            </div>
            <span className="pill pill-live">Live</span>
          </header>
          <div className="balance-orbit">
            <div>
              <span>Locked</span>
              <strong>10.7k</strong>
              <small>USDC</small>
            </div>
          </div>
          <div className="balance-legend">
            <span>
              <i className="legend-locked" />
              Locked · 74%
            </span>
            <span>
              <i className="legend-released" />
              Released · 26%
            </span>
          </div>
        </article>
      </section>
    </>
  );
}
