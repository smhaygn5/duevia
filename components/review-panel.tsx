"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { demoAgreement, demoDelivery } from "@/lib/demo-data";
import {
  getCurrentMilestone,
  loadAgreement,
  type AgreementPayload,
} from "@/lib/agreements/client";
import {
  syncAgreementTransaction,
  writeEscrowAction,
} from "@/lib/contracts/duevia";
import { useWallet } from "./wallet-provider";

type ReviewState = "review" | "changes" | "approve";

export function ReviewPanel({ agreementRef }: { agreementRef: string }) {
  const router = useRouter();
  const wallet = useWallet();
  const [state, setState] = useState<ReviewState>("review");
  const [feedback, setFeedback] = useState("");
  const [changesSent, setChangesSent] = useState(false);
  const [agreementData, setAgreementData] = useState<AgreementPayload | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDemo = agreementRef.toUpperCase() === demoAgreement.publicRef;
  const currentMilestone = agreementData
    ? getCurrentMilestone(agreementData.milestones)
    : null;
  const submission = agreementData?.submissions.find(
    (item) => item.milestone_position === currentMilestone?.position,
  );
  const realDeliverables =
    agreementData?.deliverables.filter(
      (item) => item.submission_id === submission?.id,
    ) ?? [];

  useEffect(() => {
    if (isDemo || !wallet.authenticated) return;
    void loadAgreement(agreementRef)
      .then(setAgreementData)
      .catch((loadError: unknown) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "The delivery could not be loaded.",
        ),
      );
  }, [agreementRef, isDemo, wallet.authenticated]);

  async function requestChanges(event: FormEvent) {
    event.preventDefault();
    if (!feedback.trim()) return;
    setError(null);
    if (isDemo) {
      setChangesSent(true);
      return;
    }
    if (
      !wallet.address ||
      !agreementData ||
      !currentMilestone ||
      !agreementData.agreement.contract_address
    ) {
      setError("The signed-in client and active escrow are required.");
      return;
    }
    if (agreementData.agreement.current_role !== "client") {
      setError("Only the client wallet can request changes.");
      return;
    }
    setBusy(true);
    try {
      await wallet.switchToArc();
      const receipt = await writeEscrowAction(
        wallet.address,
        agreementData.agreement.contract_address,
        {
          name: "requestChanges",
          args: [BigInt(currentMilestone.position - 1)],
        },
      );
      await syncAgreementTransaction(
        agreementRef,
        receipt,
        undefined,
        feedback.trim(),
      );
      setChangesSent(true);
    } catch (reviewError) {
      setError(
        reviewError instanceof Error
          ? reviewError.message
          : "The change request could not be confirmed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmRelease() {
    setError(null);
    if (isDemo) {
      router.push("/app/receipts/demo");
      return;
    }
    if (
      !wallet.address ||
      !agreementData ||
      !currentMilestone ||
      !agreementData.agreement.contract_address
    ) {
      setError("The signed-in client and active escrow are required.");
      return;
    }
    if (agreementData.agreement.current_role !== "client") {
      setError("Only the client wallet can approve and release settlement.");
      return;
    }
    setBusy(true);
    try {
      await wallet.switchToArc();
      const receipt = await writeEscrowAction(
        wallet.address,
        agreementData.agreement.contract_address,
        {
          name: "approveAndRelease",
          args: [BigInt(currentMilestone.position - 1)],
        },
      );
      await syncAgreementTransaction(agreementRef, receipt);
      router.push(`/app/receipts/${receipt.transactionHash}`);
    } catch (releaseError) {
      setError(
        releaseError instanceof Error
          ? releaseError.message
          : "The release could not be confirmed.",
      );
    } finally {
      setBusy(false);
    }
  }

  const milestoneTitle = currentMilestone?.title ?? "Product build";
  const milestonePosition = currentMilestone?.position ?? 2;
  const milestoneCount = agreementData?.milestones.length ?? 3;
  const amount = currentMilestone
    ? `${Number(currentMilestone.amount).toLocaleString()} USDC`
    : demoDelivery.amount;
  const provider = agreementData?.agreement.provider_address
    ? `${agreementData.agreement.provider_address.slice(0, 6)}…${agreementData.agreement.provider_address.slice(-4)}`
    : demoDelivery.provider;
  const submittedAt = submission
    ? new Date(submission.submitted_at).toLocaleString("en", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      })
    : demoDelivery.submittedAt;
  const closesAt =
    submission && currentMilestone
      ? new Date(
          submission.submitted_at +
            currentMilestone.review_window_seconds * 1_000,
        ).toLocaleString("en", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "UTC",
        })
      : demoDelivery.reviewDeadline;
  const summary =
    submission?.note?.split("\n\n")[0] ?? demoDelivery.summary;
  const deliverables = isDemo
    ? demoDelivery.deliverables.map((item) => ({
        id: item.id,
        name: item.name,
        meta: item.meta,
        href: null,
      }))
    : realDeliverables.map((item) => ({
        id: item.id,
        name: item.original_name,
        meta: `${Math.max(item.size_bytes / 1_048_576, 0.01).toFixed(2)} MB`,
        href: `/api/deliverables/${item.id}`,
      }));
  const criteria = isDemo
    ? demoDelivery.criteria
    : [
        {
          label:
            currentMilestone?.description ??
            "Delivery matches the agreed milestone scope.",
          complete: true,
        },
      ];

  if (changesSent) {
    return (
      <section className="decision-result">
        <span className="decision-result-icon warning">
          <AlertTriangle size={26} />
        </span>
        <p>Changes requested</p>
        <h1>The provider has a clear path to the next revision.</h1>
        <span>
          The milestone remains protected in escrow. One revision is available
          before the parties choose a recovery path.
        </span>
        <div className="decision-note">
          <small>Your review note</small>
          <p>{feedback}</p>
        </div>
        <Link
          className="button button-primary"
          href={`/app/agreements/${agreementRef.toLowerCase()}`}
        >
          Back to agreement
        </Link>
      </section>
    );
  }

  return (
    <>
      <Link
        className="page-back"
        href={`/app/agreements/${agreementRef.toLowerCase()}`}
      >
        <ArrowLeft size={15} />
        Back to agreement
      </Link>

      <div className="review-heading">
        <div>
          <p className="eyebrow">
            Review milestone {milestonePosition} of {milestoneCount}
          </p>
          <h1>{milestoneTitle}</h1>
          <p>
            Compare the delivery with the agreed criteria before releasing
            settlement.
          </p>
        </div>
        <div className="review-clock">
          <span>Review window</span>
          <strong>{isDemo ? demoAgreement.reviewDeadline : "Active"}</strong>
          <small>Closes {closesAt}</small>
        </div>
      </div>

      <section className="review-layout">
        <div className="review-main">
          <article className="panel delivery-card">
            <header className="panel-header">
              <div>
                <span>Submitted by {provider}</span>
                <h2>Delivery package</h2>
                <p>{submittedAt}</p>
              </div>
              <span className="status-badge status-submitted">Submitted</span>
            </header>
            <p className="delivery-summary">{summary}</p>
            <div className="deliverable-list">
              {deliverables.map((deliverable, index) => (
                <div className="deliverable-row" key={deliverable.id}>
                  <span className="file-icon">
                    {index === 2 ? <ExternalLink size={17} /> : <FileText size={17} />}
                  </span>
                  <div>
                    <strong>{deliverable.name}</strong>
                    <small>{deliverable.meta}</small>
                  </div>
                  {deliverable.href ? (
                    <a
                      href={deliverable.href}
                      aria-label={`Download ${deliverable.name}`}
                    >
                      <Download size={16} />
                    </a>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Open ${deliverable.name}`}
                      title="Demo deliverable"
                    >
                      <Download size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </article>

          <article className="panel criteria-card">
            <header className="panel-header">
              <div>
                <h2>Acceptance criteria</h2>
                <p>Confirm each promised outcome is present.</p>
              </div>
              <span>{criteria.length} / {criteria.length}</span>
            </header>
            <div className="criteria-list">
              {criteria.map((criterion) => (
                <div key={criterion.label}>
                  <span>
                    <Check size={15} />
                  </span>
                  <p>{criterion.label}</p>
                  <small>Included in delivery</small>
                </div>
              ))}
            </div>
          </article>
        </div>

        <aside className="review-decision">
          {state === "review" && (
            <>
              <span className="review-decision-icon">
                <ShieldCheck size={22} />
              </span>
              <h2>Choose the next step</h2>
              <p>
                Approval releases exactly {amount}. Requesting
                changes keeps the funds locked.
              </p>
              <div className="review-amount">
                <span>Settlement on approval</span>
                <strong>{amount}</strong>
                <small>To {provider} · Arc Testnet</small>
              </div>
              <button
                className="button button-approve"
                type="button"
                onClick={() => setState("approve")}
              >
                <CheckCircle2 size={17} />
                Approve milestone
              </button>
              <button
                className="button button-reject"
                type="button"
                onClick={() => setState("changes")}
              >
                Request changes
              </button>
            </>
          )}

          {state === "changes" && (
            <form onSubmit={requestChanges}>
              <button
                className="decision-back"
                type="button"
                onClick={() => setState("review")}
              >
                <ArrowLeft size={14} />
                Decision
              </button>
              <h2>Request changes</h2>
              <p>
                Explain what is missing and tie the note to the acceptance
                criteria.
              </p>
              <label className="field">
                <span>Review note</span>
                <textarea
                  required
                  minLength={10}
                  value={feedback}
                  onChange={(event) => setFeedback(event.target.value)}
                  placeholder="Describe the specific changes needed."
                />
              </label>
              <div className="review-warning">
                <AlertTriangle size={16} />
                {Math.max(
                  (currentMilestone?.revision_limit ?? 1) -
                    (currentMilestone?.revisions_used ?? 0),
                  0,
                )} revision is available.
              </div>
              {error && <div className="form-error" role="alert">{error}</div>}
              <button
                className="button button-reject decision-submit"
                disabled={busy}
              >
                {busy ? "Confirming on Arc..." : "Send request"}
              </button>
            </form>
          )}

          {state === "approve" && (
            <>
              <button
                className="decision-back"
                type="button"
                onClick={() => setState("review")}
              >
                <ArrowLeft size={14} />
                Decision
              </button>
              <span className="review-decision-icon approve">
                <CheckCircle2 size={22} />
              </span>
              <h2>Confirm release</h2>
              <p>
                This final confirmation releases the milestone settlement to
                the provider.
              </p>
              <div className="confirm-release">
                <div>
                  <span>Amount</span>
                  <strong>{amount}</strong>
                </div>
                <div>
                  <span>Recipient</span>
                  <strong>{provider}</strong>
                </div>
                <div>
                  <span>Network</span>
                  <strong>Arc Testnet</strong>
                </div>
              </div>
              {error && <div className="form-error" role="alert">{error}</div>}
              <button
                className="button button-approve decision-submit"
                type="button"
                disabled={busy}
                onClick={() => void confirmRelease()}
              >
                {busy ? "Confirming on Arc..." : "Confirm and release"}
              </button>
              <small className="decision-footnote">
                {isDemo
                  ? "The demo creates a receipt without moving real funds."
                  : "The confirmed transaction becomes a verifiable receipt."}
              </small>
            </>
          )}
        </aside>
      </section>
    </>
  );
}
