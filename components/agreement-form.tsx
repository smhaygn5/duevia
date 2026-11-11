"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Plus,
  ListChecks,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { cloneMilestoneSchedule } from "@/lib/agreements/clone";
import { agreementTemplates } from "@/lib/agreements/templates";
import { acceptanceChecklistPresets, checklistForPreset } from "@/lib/agreements/acceptance-checklists";
import { useWallet } from "./wallet-provider";

type MilestoneDraft = {
  title: string;
  description: string;
  amount: string;
  dueDate: string;
  reviewDays: number;
  revisionLimit: number;
  dependencyPosition?: number;
  acceptanceChecklist: string[];
};

type Counterparty = {
  name: string;
  email: string | null;
  agreement_count: number;
  last_used_at: number;
};

function checklistFromStoredValue(value: unknown, fallback: string) {
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value as string[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) return parsed;
    } catch {
      // Legacy milestones have no stored checklist.
    }
  }
  return [fallback];
}

export function AgreementForm() {
  const wallet = useWallet();
  const searchParams = useSearchParams();
  const templates = useMemo(() => agreementTemplates().map((template) => ({
    ...template,
    milestones: template.milestones.map((milestone) => ({
      ...milestone,
      acceptanceChecklist: milestone.acceptanceChecklist ?? [milestone.description],
    })),
  })), []);
  const [selectedTemplate, setSelectedTemplate] = useState<string>(templates[0].id);
  const [title, setTitle] = useState(templates[0].agreementTitle);
  const [creatorRole, setCreatorRole] = useState<"client" | "provider">("provider");
  const [counterpartyName, setCounterpartyName] = useState("Northstar Labs");
  const [counterpartyEmail, setCounterpartyEmail] = useState("");
  const [milestones, setMilestones] = useState<MilestoneDraft[]>(templates[0].milestones);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    publicRef: string;
    inviteUrl: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [cloneNotice, setCloneNotice] = useState<string | null>(null);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [counterpartyError, setCounterpartyError] = useState<string | null>(null);
  const cloneRef = searchParams.get("clone")?.toUpperCase();
  const cloneLoading = Boolean(cloneRef && wallet.authenticated && !cloneNotice && !error);

  useEffect(() => {
    if (!cloneRef || !wallet.authenticated) return;
    let active = true;

    void fetch(`/api/agreements/${encodeURIComponent(cloneRef)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as {
          agreement?: {
            title: string;
            creator_role: "client" | "provider";
            counterparty_name: string;
            counterparty_email: string | null;
          };
          milestones?: Array<{
            title: string;
            description: string;
            amount: string;
            due_at: number;
            review_window_seconds: number;
            revision_limit: number;
            dependency_position: number | null;
            acceptance_checklist: string | null;
          }>;
          message?: string;
        };
        if (!response.ok || !payload.agreement || !payload.milestones) {
          throw new Error(payload.message ?? "The agreement could not be copied.");
        }
        if (!active) return;
        setSelectedTemplate("");
        setTitle(`Copy of ${payload.agreement.title}`.slice(0, 100));
        setCreatorRole(payload.agreement.creator_role);
        setCounterpartyName(payload.agreement.counterparty_name);
        setCounterpartyEmail(payload.agreement.counterparty_email ?? "");
        setMilestones(
          cloneMilestoneSchedule(
            payload.milestones.map((milestone) => ({
              title: milestone.title,
              description: milestone.description,
              amount: milestone.amount,
              dueAt: Number(milestone.due_at),
              reviewDays: Math.max(1, Math.round(Number(milestone.review_window_seconds) / 86_400)),
              revisionLimit: Number(milestone.revision_limit),
              dependencyPosition: milestone.dependency_position ? Number(milestone.dependency_position) : undefined,
              acceptanceChecklist: checklistFromStoredValue(milestone.acceptance_checklist, milestone.description),
            })),
          ),
        );
        setCloneNotice(`Copied the terms from ${cloneRef}. Review them before creating a new invitation.`);
      })
      .catch((cloneError: unknown) => {
        if (active) {
          setError(cloneError instanceof Error ? cloneError.message : "The agreement could not be copied.");
        }
      });

    return () => {
      active = false;
    };
  }, [cloneRef, wallet.authenticated]);

  useEffect(() => {
    if (!wallet.authenticated) return;
    let active = true;
    void fetch("/api/counterparties", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as {
          counterparties?: Counterparty[];
          message?: string;
        };
        if (!response.ok || !payload.counterparties) {
          throw new Error(payload.message ?? "Saved counterparties could not be loaded.");
        }
        if (active) setCounterparties(payload.counterparties);
      })
      .catch((directoryError: unknown) => {
        if (active) {
          setCounterpartyError(
            directoryError instanceof Error
              ? directoryError.message
              : "Saved counterparties could not be loaded.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [wallet.authenticated]);

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
    value: string | number | string[] | undefined,
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
        dependencyPosition: milestones.length || undefined,
        acceptanceChecklist: ["The agreed outcome is delivered and ready for review."],
      },
    ]);
  }

  function applyTemplate(templateId: (typeof templates)[number]["id"]) {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    setSelectedTemplate(template.id);
    setTitle(template.agreementTitle);
    setMilestones(template.milestones.map((milestone) => ({ ...milestone })));
    setError(null);
  }

  function applyChecklistPreset(index: number, presetId: string) {
    const items = checklistForPreset(presetId);
    if (!items.length) return;
    updateMilestone(index, "acceptanceChecklist", items);
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
        {cloneLoading && <div className="workspace-disclosure workspace-disclosure-verified"><strong>Loading agreement terms</strong><span>Preparing an editable copy with a new future schedule.</span></div>}
        {cloneNotice && <div className="workspace-disclosure workspace-disclosure-verified"><strong>Editable agreement copy</strong><span>{cloneNotice} Payment, acceptance, activity, and delivery history are not copied.</span></div>}
        <section className="form-section">
          <div className="form-section-intro">
            <span>00</span>
            <div>
              <h2>Start with a template</h2>
              <p>Choose a structure, then edit every title, amount, date, and review rule.</p>
            </div>
          </div>
          <div className="agreement-template-grid" aria-label="Agreement templates">
            {templates.map((template) => (
              <button
                className={`agreement-template${selectedTemplate === template.id ? " selected" : ""}`}
                key={template.id}
                type="button"
                aria-pressed={selectedTemplate === template.id}
                onClick={() => applyTemplate(template.id)}
              >
                <Sparkles size={16} />
                <strong>{template.label}</strong>
                <span>{template.description}</span>
                <small>{template.milestones.length} milestones · amounts remain editable</small>
              </button>
            ))}
          </div>
        </section>
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
          {wallet.authenticated && (counterparties.length > 0 || counterpartyError) && (
            <section className="counterparty-directory" aria-label="Saved counterparties">
              <div>
                <strong>Saved counterparties</strong>
                <p>Reuse a name and optional email from an agreement visible to this wallet.</p>
              </div>
              {counterpartyError ? (
                <small className="form-error">{counterpartyError}</small>
              ) : (
                <div className="counterparty-directory-list">
                  {counterparties.map((counterparty) => (
                    <button
                      key={`${counterparty.name}-${counterparty.email ?? "no-email"}`}
                      className={`counterparty-directory-card${counterpartyName === counterparty.name && counterpartyEmail === (counterparty.email ?? "") ? " selected" : ""}`}
                      type="button"
                      onClick={() => {
                        setCounterpartyName(counterparty.name);
                        setCounterpartyEmail(counterparty.email ?? "");
                      }}
                    >
                      <span>{counterparty.name}</span>
                      <small>{counterparty.email ?? "No email saved"}</small>
                      <em>{counterparty.agreement_count} agreement{counterparty.agreement_count === 1 ? "" : "s"}</em>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
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
                  <label className="field full milestone-dependency-field">
                    <span>Required prior milestone</span>
                    <select
                      value={milestone.dependencyPosition ?? ""}
                      onChange={(event) =>
                        updateMilestone(
                          index,
                          "dependencyPosition",
                          event.target.value ? Number(event.target.value) : undefined,
                        )
                      }
                    >
                      <option value="">No additional prerequisite</option>
                      {milestones.slice(0, index).map((prior, priorIndex) => (
                        <option value={priorIndex + 1} key={priorIndex}>
                          {String(priorIndex + 1).padStart(2, "0")} · {prior.title || "Untitled milestone"}
                        </option>
                      ))}
                    </select>
                    <small>
                      {index === 0
                        ? "The first milestone begins after agreement funding."
                        : "Duevia still settles every stage in sequence; this records the key approval that unlocks this work."}
                    </small>
                  </label>
                  <section className="acceptance-checklist-editor field full" aria-label={`Acceptance checklist for milestone ${index + 1}`}>
                    <div>
                      <span><ListChecks size={14} /> Acceptance checklist</span>
                      <small>These checks must be confirmed before this milestone can release.</small>
                    </div>
                    <select aria-label="Apply reusable acceptance checklist" defaultValue="" onChange={(event) => applyChecklistPreset(index, event.target.value)}>
                      <option value="" disabled>Apply a reusable checklist</option>
                      {acceptanceChecklistPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                    </select>
                    <div className="acceptance-checklist-items">
                      {milestone.acceptanceChecklist.map((item, itemIndex) => (
                        <label key={`${itemIndex}-${item}`}>
                          <input value={item} onChange={(event) => updateMilestone(index, "acceptanceChecklist", milestone.acceptanceChecklist.map((current, currentIndex) => currentIndex === itemIndex ? event.target.value : current))} />
                          <button type="button" aria-label={`Remove checklist item ${itemIndex + 1}`} onClick={() => updateMilestone(index, "acceptanceChecklist", milestone.acceptanceChecklist.filter((_, currentIndex) => currentIndex !== itemIndex))} disabled={milestone.acceptanceChecklist.length === 1}><Trash2 size={14} /></button>
                        </label>
                      ))}
                    </div>
                    <button className="add-checklist-item" type="button" onClick={() => updateMilestone(index, "acceptanceChecklist", [...milestone.acceptanceChecklist, ""])}><Plus size={14} /> Add check</button>
                  </section>
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
        <button className="button button-primary summary-submit" disabled={submitting || cloneLoading}>
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
