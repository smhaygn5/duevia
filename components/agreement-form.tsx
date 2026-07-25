"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useWallet } from "./wallet-provider";

type MilestoneDraft = {
  title: string;
  description: string;
  amount: string;
  dueDate: string;
  reviewDays: number;
  revisionLimit: number;
};

const defaults: MilestoneDraft[] = [
  {
    title: "Discovery & scope",
    description:
      "Research, requirements, and an agreed delivery roadmap for the engagement.",
    amount: "1000",
    dueDate: "2026-08-05",
    reviewDays: 3,
    revisionLimit: 1,
  },
  {
    title: "Primary delivery",
    description:
      "The main project output, delivered against the agreed acceptance criteria.",
    amount: "2500",
    dueDate: "2026-08-19",
    reviewDays: 3,
    revisionLimit: 1,
  },
];

export function AgreementForm() {
  const wallet = useWallet();
  const [title, setTitle] = useState("Global Product Launch");
  const [creatorRole, setCreatorRole] = useState<"client" | "provider">("provider");
  const [counterpartyName, setCounterpartyName] = useState("Northstar Labs");
  const [counterpartyEmail, setCounterpartyEmail] = useState("");
  const [milestones, setMilestones] = useState<MilestoneDraft[]>(defaults);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    publicRef: string;
    inviteUrl: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const total = useMemo(
    () =>
      milestones.reduce((sum, milestone) => {
        const amount = Number(milestone.amount);
        return sum + (Number.isFinite(amount) ? amount : 0);
      }, 0),
    [milestones],
  );

  function updateMilestone(
    index: number,
    field: keyof MilestoneDraft,
    value: string | number,
  ) {
    setMilestones((current) =>
      current.map((milestone, itemIndex) =>
        itemIndex === index ? { ...milestone, [field]: value } : milestone,
      ),
    );
  }

  function addMilestone() {
    const previousDate =
      milestones.at(-1)?.dueDate ?? new Date().toISOString().slice(0, 10);
    const nextDate = new Date(`${previousDate}T12:00:00.000Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 7);
    setMilestones((current) => [
      ...current,
      {
        title: "",
        description: "",
        amount: "",
        dueDate: nextDate.toISOString().slice(0, 10),
        reviewDays: 3,
        revisionLimit: 1,
      },
    ]);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!wallet.authenticated) {
      setError("Connect, switch to Arc, and sign in before creating an agreement.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/agreements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          creatorRole,
          counterpartyName,
          counterpartyEmail,
          milestones,
        }),
      });
      const payload = (await response.json()) as {
        publicRef?: string;
        inviteUrl?: string;
        message?: string;
      };
      if (!response.ok || !payload.publicRef || !payload.inviteUrl) {
        throw new Error(payload.message ?? "Agreement could not be created.");
      }
      setResult({
        publicRef: payload.publicRef,
        inviteUrl: payload.inviteUrl,
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Agreement could not be created.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <section className="creation-success">
        <div className="success-check">
          <Check size={28} />
        </div>
        <p>Agreement ready</p>
        <h2>{title}</h2>
        <span>
          {result.publicRef} · {total.toLocaleString()} USDC
        </span>
        <div className="invite-link-box">
          <div>
            <small>Private invitation link</small>
            <code>{result.inviteUrl}</code>
          </div>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(result.inviteUrl);
              setCopied(true);
            }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="security-note">
          Anyone with this link can review the terms. Only the accepting wallet
          becomes the counterparty.
        </p>
        <div className="success-actions">
          <Link
            className="button button-primary"
            href={`/app/agreements/${result.publicRef.toLowerCase()}`}
          >
            Open agreement
            <ArrowRight size={16} />
          </Link>
          <Link className="button button-quiet" href="/app/agreements">
            All agreements
          </Link>
        </div>
      </section>
    );
  }

  return (
    <form className="agreement-form-layout" onSubmit={submit}>
      <div className="agreement-form-main">
        <section className="form-section">
          <div className="form-section-intro">
            <span>01</span>
            <div>
              <h2>Agreement basics</h2>
              <p>Keep the title clear enough for both parties to recognize.</p>
            </div>
          </div>
          <div className="form-fields">
            <label className="field full">
              <span>Agreement title</span>
              <input
                required
                minLength={3}
                maxLength={100}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="field">
              <span>You are the</span>
              <select
                value={creatorRole}
                onChange={(event) =>
                  setCreatorRole(event.target.value as "client" | "provider")
                }
              >
                <option value="provider">Service provider</option>
                <option value="client">Client</option>
              </select>
            </label>
            <label className="field">
              <span>Counterparty name</span>
              <input
                required
                value={counterpartyName}
                onChange={(event) => setCounterpartyName(event.target.value)}
              />
            </label>
            <label className="field full">
              <span>Counterparty email · optional</span>
              <input
                type="email"
                value={counterpartyEmail}
                placeholder="name@company.com"
                onChange={(event) => setCounterpartyEmail(event.target.value)}
              />
              <small>Duevia creates a private link; email sending is not automatic yet.</small>
            </label>
          </div>
        </section>

        <section className="form-section">
          <div className="form-section-intro">
            <span>02</span>
            <div>
              <h2>Milestones</h2>
              <p>Define outcomes, dates, review time, and revision limits.</p>
            </div>
          </div>
          <div className="milestone-editor-list">
            {milestones.map((milestone, index) => (
              <article className="milestone-editor" key={index}>
                <header>
                  <div>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{milestone.title || "Untitled milestone"}</strong>
                  </div>
                  {milestones.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Remove milestone ${index + 1}`}
                      onClick={() =>
                        setMilestones((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </header>
                <div className="form-fields">
                  <label className="field">
                    <span>Milestone title</span>
                    <input
                      required
                      value={milestone.title}
                      onChange={(event) =>
                        updateMilestone(index, "title", event.target.value)
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Amount · USDC</span>
                    <input
                      required
                      inputMode="decimal"
                      value={milestone.amount}
                      onChange={(event) =>
                        updateMilestone(index, "amount", event.target.value)
                      }
                    />
                  </label>
                  <label className="field full">
                    <span>Outcome and acceptance criteria</span>
                    <textarea
                      required
                      minLength={10}
                      value={milestone.description}
                      onChange={(event) =>
                        updateMilestone(index, "description", event.target.value)
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Due date</span>
                    <input
                      required
                      type="date"
                      value={milestone.dueDate}
                      onChange={(event) =>
                        updateMilestone(index, "dueDate", event.target.value)
                      }
                    />
                  </label>
                  <label className="field compact">
                    <span>Review days</span>
                    <select
                      value={milestone.reviewDays}
                      onChange={(event) =>
                        updateMilestone(
                          index,
                          "reviewDays",
                          Number(event.target.value),
                        )
                      }
                    >
                      {[1, 2, 3, 5, 7, 10, 14].map((days) => (
                        <option value={days} key={days}>
                          {days} days
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field compact">
                    <span>Revisions</span>
                    <select
                      value={milestone.revisionLimit}
                      onChange={(event) =>
                        updateMilestone(
                          index,
                          "revisionLimit",
                          Number(event.target.value),
                        )
                      }
                    >
                      {[0, 1, 2, 3].map((count) => (
                        <option value={count} key={count}>
                          {count}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </article>
            ))}
          </div>
          <button className="add-milestone" type="button" onClick={addMilestone}>
            <Plus size={16} />
            Add milestone
          </button>
        </section>
      </div>

      <aside className="agreement-summary">
        <p>Agreement summary</p>
        <h2>{title || "Untitled agreement"}</h2>
        <dl>
          <div>
            <dt>Your role</dt>
            <dd>{creatorRole === "provider" ? "Provider" : "Client"}</dd>
          </div>
          <div>
            <dt>Counterparty</dt>
            <dd>{counterpartyName || "Not set"}</dd>
          </div>
          <div>
            <dt>Milestones</dt>
            <dd>{milestones.length}</dd>
          </div>
          <div className="summary-total">
            <dt>Total funding</dt>
            <dd>{total.toLocaleString()} USDC</dd>
          </div>
        </dl>
        <div className="summary-flow">
          <span>Agree</span>
          <i />
          <span>Fund</span>
          <i />
          <span>Deliver</span>
          <i />
          <span>Settle</span>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="button button-primary summary-submit" disabled={submitting}>
          {submitting ? "Creating…" : "Create & generate invite"}
          <ArrowRight size={16} />
        </button>
        {!wallet.authenticated && (
          <small className="summary-help">
            Use the wallet control above to connect, switch to Arc, and sign in.
          </small>
        )}
        <Link className="back-link" href="/app/agreements">
          <ArrowLeft size={15} />
          Cancel
        </Link>
      </aside>
    </form>
  );
}
