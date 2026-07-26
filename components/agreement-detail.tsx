"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Circle,
  Clock3,
  ExternalLink,
  FileText,
  LockKeyhole,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppHeader } from "./app-header";
import { StatusBadge } from "./status-badge";
import { useWallet } from "./wallet-provider";
import { demoAgreement } from "@/lib/demo-data";

type DetailModel = {
  publicRef: string;
  title: string;
  status: string;
  total: string;
  locked: string;
  released: string;
  counterparty: string;
  currentRole: "client" | "provider";
  contractAddress: string | null;
  milestones: Array<{
    position: number;
    title: string;
    description: string;
    amount: string;
    status: string;
    due: string;
    reviewDays: number;
    revisionLimit: number;
  }>;
  activities: Array<{
    title: string;
    detail: string;
    time: string;
    tone: string;
  }>;
};

const demoModel: DetailModel = {
  publicRef: demoAgreement.publicRef,
  title: demoAgreement.title,
  status: demoAgreement.status,
  total: demoAgreement.total,
  locked: demoAgreement.locked,
  released: demoAgreement.released,
  counterparty: demoAgreement.client,
  currentRole: "client",
  contractAddress: demoAgreement.contractAddress,
  milestones: [...demoAgreement.milestones],
  activities: [...demoAgreement.activities],
};

function titleCase(value: string) {
  return value
    .split("_")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

function activityTitle(type: string) {
  return titleCase(type.replace(".", "_"));
}

export function AgreementDetail({ agreementRef }: { agreementRef: string }) {
  const wallet = useWallet();
  const isDemo = agreementRef.toUpperCase() === demoAgreement.publicRef;
  const [detail, setDetail] = useState<DetailModel | null>(
    isDemo ? demoModel : null,
  );
  const [loading, setLoading] = useState(!isDemo);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isDemo) return;
    if (!wallet.authenticated) return;

    void fetch(`/api/agreements/${agreementRef}`, { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as {
          agreement?: Record<string, string | number | null>;
          milestones?: Array<Record<string, string | number | null>>;
          activities?: Array<Record<string, string | number | null>>;
          message?: string;
        };
        if (!response.ok || !data.agreement || !data.milestones) {
          throw new Error(data.message ?? "Agreement not found.");
        }
        const released = data.milestones
          .filter((milestone) => milestone.state === "released")
          .reduce((sum, milestone) => sum + Number(milestone.amount ?? 0), 0);
        const total = Number(data.agreement.total_amount ?? 0);
        setDetail({
          publicRef: String(data.agreement.public_ref),
          title: String(data.agreement.title),
          status: titleCase(String(data.agreement.state)),
          total: total.toLocaleString(),
          released: released.toLocaleString(),
          locked: Math.max(total - released, 0).toLocaleString(),
          counterparty: String(data.agreement.counterparty_name),
          currentRole: String(data.agreement.current_role) as
            | "client"
            | "provider",
          contractAddress: data.agreement.contract_address
            ? String(data.agreement.contract_address)
            : null,
          milestones: data.milestones.map((milestone) => ({
            position: Number(milestone.position),
            title: String(milestone.title),
            description: String(milestone.description),
            amount: Number(milestone.amount ?? 0).toLocaleString(),
            status: String(milestone.state),
            due: new Date(Number(milestone.due_at)).toLocaleDateString("en", {
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
            reviewDays: Number(milestone.review_window_seconds) / 86_400,
            revisionLimit: Number(milestone.revision_limit),
          })),
          activities: (data.activities ?? []).map((activity) => {
            let parsed: Record<string, unknown> = {};
            try {
              parsed = activity.detail
                ? (JSON.parse(String(activity.detail)) as Record<
                    string,
                    unknown
                  >)
                : {};
            } catch {
              parsed = {};
            }
            return {
              title: activityTitle(String(activity.type)),
              detail:
                typeof parsed.reviewNote === "string"
                  ? parsed.reviewNote
                  : activity.tx_hash
                    ? `Verified on Arc · ${String(activity.tx_hash).slice(0, 10)}…`
                    : "Recorded in the agreement timeline.",
              time: new Date(Number(activity.occurred_at)).toLocaleString("en", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }),
              tone: String(activity.type).includes("released")
                ? "success"
                : activity.tx_hash
                  ? "accent"
                  : "muted",
            };
          }),
        });
      })
      .catch((fetchError: unknown) => {
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Agreement could not be loaded.",
        );
      })
      .finally(() => setLoading(false));
  }, [agreementRef, isDemo, wallet.authenticated]);

  if (!isDemo && !wallet.ready) {
    return <div className="page-state">Checking wallet session…</div>;
  }
  if (!isDemo && !wallet.authenticated) {
    return (
      <div className="page-state error-state">
        <h1>Wallet sign-in required</h1>
        <p>Sign in with the wallet that created or accepted this agreement.</p>
        <Link className="button button-quiet" href="/app/agreements">
          Back to agreements
        </Link>
      </div>
    );
  }
  if (loading) {
    return <div className="page-state">Loading agreement…</div>;
  }
  if (!detail) {
    return (
      <div className="page-state error-state">
        <h1>Agreement unavailable</h1>
        <p>{error}</p>
        <Link className="button button-quiet" href="/app/agreements">
          Back to agreements
        </Link>
      </div>
    );
  }

  const current =
    detail.milestones.find((milestone) =>
      ["submitted", "in_progress", "pending", "changes_requested"].includes(
        milestone.status,
      ),
    ) ?? detail.milestones.at(-1);
  const needsFunding = detail.status.toLowerCase().includes("awaiting");
  const needsReview =
    current?.status === "submitted" && detail.currentRole === "client";
  const canFund = needsFunding && detail.currentRole === "client";
  const canSubmit =
    detail.currentRole === "provider" &&
    ["pending", "in_progress", "changes_requested"].includes(
      current?.status ?? "",
    );

  return (
    <>
      <Link className="page-back" href="/app/agreements">
        <ArrowLeft size={15} />
        Agreements
      </Link>
      <AppHeader
        eyebrow={isDemo ? `${detail.publicRef} · Demo agreement` : detail.publicRef}
        title={detail.title}
        description={`With ${detail.counterparty} · Arc Testnet`}
        action={<StatusBadge status={detail.status} />}
      />

      {isDemo && (
        <div className="workspace-disclosure workspace-disclosure-demo">
          <strong>Guided demo · fictional agreement</strong>
          <span>
            The parties, balances, milestones, dates, and activity below are
            illustrative. No escrow contract or USDC transfer exists for this
            agreement.
          </span>
        </div>
      )}

      <section className="agreement-detail-grid">
        <div className="agreement-detail-main">
          <div className="agreement-financials">
            <article>
              <span>Total agreement</span>
              <strong>{detail.total}</strong>
              <small>USDC</small>
            </article>
            <article>
              <span>Locked</span>
              <strong>{detail.locked}</strong>
              <small>USDC</small>
            </article>
            <article>
              <span>Released</span>
              <strong>{detail.released}</strong>
              <small>USDC</small>
            </article>
          </div>

          <section className="panel milestone-timeline-panel">
            <header className="panel-header">
              <div>
                <h2>Milestones</h2>
                <p>Work progresses sequentially through the agreement.</p>
              </div>
              <span>{detail.milestones.length} stages</span>
            </header>
            <div className="detail-milestones">
              {detail.milestones.map((milestone) => {
                const released = milestone.status === "released";
                const active = milestone === current;
                return (
                  <article
                    className={`detail-milestone${active ? " active" : ""}`}
                    key={milestone.position}
                  >
                    <span className="timeline-line" />
                    <span
                      className={`timeline-node${released ? " released" : ""}`}
                    >
                      {released ? (
                        <Check size={14} />
                      ) : active ? (
                        <Clock3 size={14} />
                      ) : (
                        <Circle size={11} />
                      )}
                    </span>
                    <div className="detail-milestone-copy">
                      <span>
                        {String(milestone.position).padStart(2, "0")} ·{" "}
                        {titleCase(milestone.status)}
                      </span>
                      <h3>{milestone.title}</h3>
                      <p>{milestone.description}</p>
                      <small>
                        Due {milestone.due} · {milestone.reviewDays} day review ·{" "}
                        {milestone.revisionLimit} revision
                      </small>
                    </div>
                    <strong>{milestone.amount} USDC</strong>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="panel activity-panel">
            <header className="panel-header">
              <div>
                <h2>Activity</h2>
                <p>Human-readable events linked to verifiable settlement.</p>
              </div>
              <Link className="text-link" href="/app/activity">
                Full activity
              </Link>
            </header>
            <div className="activity-list">
              {detail.activities.map((activity) => (
                <div className="activity-row" key={`${activity.title}-${activity.time}`}>
                  <span className={`activity-dot ${activity.tone}`} />
                  <div>
                    <strong>{activity.title}</strong>
                    <p>{activity.detail}</p>
                  </div>
                  <time>{activity.time}</time>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="action-panel">
          <span className="action-label">Action required</span>
          {canFund ? (
            <>
              <div className="action-icon">
                <LockKeyhole size={22} />
              </div>
              <h2>Fund the agreement</h2>
              <p>
                Lock {detail.total} USDC on Arc so the provider can begin the
                first milestone.
              </p>
              <Link
                className="button button-primary action-primary"
                href={`/app/agreements/${detail.publicRef.toLowerCase()}/fund`}
              >
                Prepare funding
                <ArrowRight size={16} />
              </Link>
            </>
          ) : needsReview ? (
            <>
              <div className="action-icon">
                <FileText size={22} />
              </div>
              <h2>Review milestone {current?.position}</h2>
              <p>
                The provider submitted deliverables. Approval releases{" "}
                {current?.amount} USDC.
              </p>
              <Link
                className="button button-primary action-primary"
                href={`/app/agreements/${detail.publicRef.toLowerCase()}/review`}
              >
                Review delivery
                <ArrowRight size={16} />
              </Link>
            </>
          ) : canSubmit ? (
            <>
              <div className="action-icon">
                <FileText size={22} />
              </div>
              <h2>Prepare the delivery</h2>
              <p>
                Upload files or add links, then submit the current milestone for
                review.
              </p>
              <Link
                className="button button-primary action-primary"
                href={`/app/agreements/${detail.publicRef.toLowerCase()}/submit`}
              >
                Submit milestone
                <ArrowRight size={16} />
              </Link>
            </>
          ) : (
            <>
              <div className="action-icon">
                <Clock3 size={22} />
              </div>
              <h2>Waiting for the counterparty</h2>
              <p>
                The next action belongs to the{" "}
                {detail.currentRole === "client" ? "provider" : "client"}.
                Duevia will update this agreement after Arc confirms it.
              </p>
            </>
          )}
          <div className="action-facts">
            <div>
              <span>Network</span>
              <strong>Arc Testnet</strong>
            </div>
            <div>
              <span>Settlement</span>
              <strong>USDC</strong>
            </div>
            <div>
              <span>Escrow</span>
              <strong>
                {detail.contractAddress
                  ? `${detail.contractAddress.slice(0, 6)}…${detail.contractAddress.slice(-4)}`
                  : "Pending deployment"}
              </strong>
            </div>
            <a href="https://testnet.arcscan.app" target="_blank" rel="noreferrer">
              Open explorer
              <ExternalLink size={13} />
            </a>
            <Link
              className="recovery-link"
              href={`/app/agreements/${detail.publicRef.toLowerCase()}/recovery`}
            >
              Cancellation & recovery
              <ArrowRight size={13} />
            </Link>
          </div>
        </aside>
      </section>
    </>
  );
}
