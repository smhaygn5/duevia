"use client";

import {
  ArrowLeft,
  Check,
  File,
  Link2,
  UploadCloud,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { keccak256, toBytes } from "viem";
import {
  getCurrentMilestone,
  loadAgreement,
  type AgreementPayload,
} from "@/lib/agreements/client";
import {
  syncAgreementTransaction,
  writeEscrowAction,
} from "@/lib/contracts/duevia";
import { demoAgreement } from "@/lib/demo-data";
import { useWallet } from "./wallet-provider";

type UploadedFile = {
  id: string;
  name: string;
  size: number;
  status: "ready" | "uploading" | "uploaded" | "error";
  message?: string;
};

function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SubmissionForm({ agreementRef }: { agreementRef: string }) {
  const wallet = useWallet();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"file" | "link">("file");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [deliverySummary, setDeliverySummary] = useState(
    "Completed the responsive product screens and prepared the implementation handoff.",
  );
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDemo = agreementRef.toUpperCase() === demoAgreement.publicRef;
  const submissionId = useRef(crypto.randomUUID());
  const [agreementData, setAgreementData] = useState<AgreementPayload | null>(
    null,
  );
  const currentMilestone = agreementData
    ? getCurrentMilestone(agreementData.milestones)
    : null;

  useEffect(() => {
    if (isDemo || !wallet.authenticated) return;
    void loadAgreement(agreementRef)
      .then(setAgreementData)
      .catch((loadError: unknown) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Agreement could not be loaded.",
        ),
      );
  }, [agreementRef, isDemo, wallet.authenticated]);

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    setError(null);
    for (const file of selected) {
      const localId = crypto.randomUUID();
      setFiles((current) => [
        ...current,
        { id: localId, name: file.name, size: file.size, status: "uploading" },
      ]);

      if (isDemo) {
        setFiles((current) =>
          current.map((item) =>
            item.id === localId ? { ...item, status: "ready" } : item,
          ),
        );
        continue;
      }
      if (!wallet.authenticated) {
        setFiles((current) =>
          current.map((item) =>
            item.id === localId
              ? { ...item, status: "error", message: "Sign in to upload." }
              : item,
          ),
        );
        continue;
      }

      const body = new FormData();
      body.set("file", file);
      body.set("agreementRef", agreementRef.toUpperCase());
      body.set("milestonePosition", String(currentMilestone?.position ?? 2));
      body.set("submissionId", submissionId.current);
      try {
        const response = await fetch("/api/deliverables", {
          method: "POST",
          body,
        });
        const payload = (await response.json()) as {
          id?: string;
          message?: string;
        };
        if (!response.ok || !payload.id) {
          throw new Error(payload.message ?? "Upload failed.");
        }
        setFiles((current) =>
          current.map((item) =>
            item.id === localId
              ? { ...item, id: payload.id!, status: "uploaded" }
              : item,
          ),
        );
      } catch (uploadError) {
        setFiles((current) =>
          current.map((item) =>
            item.id === localId
              ? {
                  ...item,
                  status: "error",
                  message:
                    uploadError instanceof Error
                      ? uploadError.message
                      : "Upload failed.",
                }
              : item,
          ),
        );
      }
    }
    event.target.value = "";
  }

  async function removeFile(file: UploadedFile) {
    setError(null);
    if (file.status === "uploaded") {
      try {
        const response = await fetch(`/api/deliverables/${file.id}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          const payload = (await response.json()) as { message?: string };
          throw new Error(payload.message ?? "The protected file could not be removed.");
        }
      } catch (removeError) {
        setError(
          removeError instanceof Error
            ? removeError.message
            : "The protected file could not be removed.",
        );
        return;
      }
    }
    setFiles((current) => current.filter((item) => item.id !== file.id));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!deliverySummary.trim()) {
      setError("Add a short delivery summary.");
      return;
    }
    if (!files.some((file) => file.status === "ready" || file.status === "uploaded") && !link) {
      setError("Add at least one file or delivery link.");
      return;
    }
    if (isDemo) {
      setSubmitted(true);
      return;
    }
    if (!wallet.address || !wallet.authenticated) {
      setError("Connect and sign in with the provider wallet first.");
      return;
    }
    if (
      !agreementData ||
      !currentMilestone ||
      !agreementData.agreement.contract_address
    ) {
      setError("The funded Arc escrow is not ready yet.");
      return;
    }
    if (agreementData.agreement.current_role !== "provider") {
      setError("Only the provider wallet can submit this milestone.");
      return;
    }
    if (
      !["pending", "in_progress", "changes_requested"].includes(
        currentMilestone.state,
      )
    ) {
      setError("This milestone is not available for submission.");
      return;
    }

    setBusy(true);
    try {
      await wallet.switchToArc();
      if (currentMilestone.state === "pending") {
        const startReceipt = await writeEscrowAction(
          wallet.address,
          agreementData.agreement.contract_address,
          { name: "startCurrentMilestone", args: [] },
        );
        await syncAgreementTransaction(agreementRef, startReceipt);
      }
      const submissionHash = keccak256(
        toBytes(
          JSON.stringify({
            submissionId: submissionId.current,
            milestonePosition: currentMilestone.position,
            deliverySummary: deliverySummary.trim(),
            message: message.trim(),
            link: link.trim(),
            deliverableIds: files
              .filter((file) => file.status === "uploaded")
              .map((file) => file.id)
              .sort(),
          }),
        ),
      );
      const receipt = await writeEscrowAction(
        wallet.address,
        agreementData.agreement.contract_address,
        {
          name: "submit",
          args: [BigInt(currentMilestone.position - 1), submissionHash],
        },
      );
      await syncAgreementTransaction(agreementRef, receipt, {
        id: submissionId.current,
        hash: submissionHash,
        note: [deliverySummary.trim(), message.trim(), link.trim()]
          .filter(Boolean)
          .join("\n\n")
          .slice(0, 2_000),
      });
      setSubmitted(true);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "The milestone could not be submitted.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <section className="submission-success">
        <div className="success-check">
          <Check size={28} />
        </div>
        <p>Milestone submitted</p>
        <h1>{currentMilestone?.title ?? "Product build"} is ready for review.</h1>
        <span>
          The{" "}
          {currentMilestone
            ? currentMilestone.review_window_seconds / 86_400
            : 3}
          -day review window has started.
        </span>
        <div className="submission-result">
          <div>
            <small>Milestone</small>
            <strong>
              {String(currentMilestone?.position ?? 2).padStart(2, "0")} ·{" "}
              {currentMilestone?.title ?? "Product build"}
            </strong>
          </div>
          <div>
            <small>Settlement</small>
            <strong>
              {Number(currentMilestone?.amount ?? 2_500).toLocaleString()} USDC
            </strong>
          </div>
          <div>
            <small>Deliverables</small>
            <strong>{files.length + (link ? 1 : 0)}</strong>
          </div>
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
      <form className="submission-layout" onSubmit={submit}>
        <section className="submission-main">
          <p className="eyebrow">
            Submit milestone {currentMilestone?.position ?? 2} of{" "}
            {agreementData?.milestones.length ?? 3}
          </p>
          <h1>{currentMilestone?.title ?? "Product build"}</h1>
          <p>
            Submitting starts the 3-day review window. Files stay protected and
            only their proof is connected to settlement.
          </p>

          <div className="upload-tabs">
            <button
              type="button"
              className={mode === "file" ? "active" : ""}
              onClick={() => setMode("file")}
            >
              <UploadCloud size={16} />
              Upload files
            </button>
            <button
              type="button"
              className={mode === "link" ? "active" : ""}
              onClick={() => setMode("link")}
            >
              <Link2 size={16} />
              Add link
            </button>
          </div>

          {mode === "file" ? (
            <>
              <button
                className="upload-dropzone"
                type="button"
                onClick={() => inputRef.current?.click()}
              >
                <UploadCloud size={28} />
                <strong>Choose protected deliverables</strong>
                <span>PDF, ZIP, PNG, JPG, WEBP, TXT or CSV · max 10 MB</span>
              </button>
              <input
                className="sr-only"
                ref={inputRef}
                type="file"
                multiple
                accept=".pdf,.zip,.png,.jpg,.jpeg,.webp,.txt,.csv"
                onChange={(event) => void handleFiles(event)}
              />
            </>
          ) : (
            <label className="field">
              <span>Delivery link</span>
              <input
                type="url"
                placeholder="https://"
                value={link}
                onChange={(event) => setLink(event.target.value)}
              />
              <small>Use a link that the client can access during review.</small>
            </label>
          )}

          {files.length > 0 && (
            <div className="upload-file-list">
              {files.map((file) => (
                <div className={`upload-file ${file.status}`} key={file.id}>
                  <span className="file-icon">
                    <File size={17} />
                  </span>
                  <div>
                    <strong>{file.name}</strong>
                    <small>
                      {fileSize(file.size)} ·{" "}
                      {file.status === "uploading"
                        ? "Uploading…"
                        : file.status === "error"
                          ? file.message
                          : file.status === "uploaded"
                            ? "Protected in R2"
                            : "Ready for demo"}
                    </small>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    disabled={file.status === "uploading"}
                    onClick={() => void removeFile(file)}
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <label className="field">
            <span>Delivery summary</span>
            <textarea
              required
              value={deliverySummary}
              onChange={(event) => setDeliverySummary(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Message to client · optional</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Add context for the review."
            />
          </label>
        </section>

        <aside className="submission-summary">
          <span>
            Milestone {String(currentMilestone?.position ?? 2).padStart(2, "0")}
          </span>
          <h2>{currentMilestone?.title ?? "Product build"}</h2>
          <dl>
            <div>
              <dt>Settlement</dt>
              <dd>
                {Number(currentMilestone?.amount ?? 2_500).toLocaleString()} USDC
              </dd>
            </div>
            <div>
              <dt>Review window</dt>
              <dd>
                {currentMilestone
                  ? currentMilestone.review_window_seconds / 86_400
                  : 3} days
              </dd>
            </div>
            <div>
              <dt>Revisions</dt>
              <dd>
                {currentMilestone
                  ? Math.max(
                      currentMilestone.revision_limit -
                        currentMilestone.revisions_used,
                      0,
                    )
                  : 1} available
              </dd>
            </div>
            <div>
              <dt>Storage</dt>
              <dd>{isDemo ? "Demo preview" : "Protected R2"}</dd>
            </div>
          </dl>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button
            className="button button-primary summary-submit"
            disabled={busy}
          >
            {busy ? "Confirming on Arc..." : "Submit for review"}
          </button>
          <small>
            {isDemo
              ? "The demo does not broadcast a transaction."
              : "The wallet shows each Arc transaction before submission."}
          </small>
        </aside>
      </form>
    </>
  );
}
