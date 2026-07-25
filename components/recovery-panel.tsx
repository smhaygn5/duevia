"use client";

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Handshake,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { demoAgreement } from "@/lib/demo-data";
import {
  getCurrentMilestone,
  loadAgreement,
  type AgreementPayload,
} from "@/lib/agreements/client";
import {
  syncAgreementTransaction,
  writeEscrowAction,
  type EscrowWriteAction,
} from "@/lib/contracts/duevia";
import { useWallet } from "./wallet-provider";

const paths = [
  {
    id: "mutual",
    icon: Handshake,
    title: "Mutual cancellation",
    description:
      "Both parties sign the same cancellation terms. Unreleased funds return to the client.",
    availability: "Available now",
    enabled: true,
  },
  {
    id: "deadline",
    icon: Clock3,
    title: "Deadline recovery",
    description:
      "Recover an untouched milestone after its delivery deadline and grace period have passed.",
    availability: "Available Aug 1, 2026",
    enabled: false,
  },
  {
    id: "prework",
    icon: RotateCcw,
    title: "Cancel before work starts",
    description:
      "Cancel an accepted agreement before its first milestone enters progress.",
    availability: "Not available for an active agreement",
    enabled: false,
  },
] as const;

export function RecoveryPanel({ agreementRef }: { agreementRef: string }) {
  const wallet = useWallet();
  const [selected, setSelected] = useState<(typeof paths)[number] | null>(null);
  const [requested, setRequested] = useState(false);
  const [agreementData, setAgreementData] = useState<AgreementPayload | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTime] = useState(() => Date.now());
  const isDemo = agreementRef.toUpperCase() === demoAgreement.publicRef;
  const currentMilestone = agreementData
    ? getCurrentMilestone(agreementData.milestones)
    : null;
  const total = agreementData
    ? Number(agreementData.agreement.total_amount)
    : Number(demoAgreement.total.replace(",", ""));
  const released = agreementData
    ? agreementData.milestones
        .filter((milestone) => milestone.state === "released")
        .reduce((sum, milestone) => sum + Number(milestone.amount), 0)
    : Number(demoAgreement.released.replace(",", ""));
  const locked = Math.max(total - released, 0);

  useEffect(() => {
    if (isDemo || !wallet.authenticated) return;
    void loadAgreement(agreementRef)
      .then(setAgreementData)
      .catch((loadError: unknown) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Recovery options could not be loaded.",
        ),
      );
  }, [agreementRef, isDemo, wallet.authenticated]);

  function isAvailable(pathId: (typeof paths)[number]["id"]) {
    if (isDemo) return pathId === "mutual";
    if (!agreementData?.agreement.contract_address || !currentMilestone) {
      return false;
    }
    if (pathId === "mutual") {
      return ["active", "cancel_pending"].includes(
        agreementData.agreement.state,
      );
    }
    if (agreementData.agreement.current_role !== "client") return false;
    if (pathId === "deadline") {
      return (
        currentTime > currentMilestone.due_at + 2 * 86_400_000 &&
        ["pending", "in_progress", "changes_requested"].includes(
          currentMilestone.state,
        )
      );
    }
    return (
      currentMilestone.position === 1 &&
      currentMilestone.state === "pending" &&
      released === 0
    );
  }

  async function executeRecovery() {
    if (!selected) return;
    setError(null);
    if (isDemo) {
      setRequested(true);
      return;
    }
    if (
      !wallet.address ||
      !agreementData?.agreement.contract_address ||
      !isAvailable(selected.id)
    ) {
      setError("This recovery path is not currently available.");
      return;
    }
    const actions: Record<(typeof paths)[number]["id"], EscrowWriteAction> = {
      mutual: { name: "approveMutualCancellation", args: [] },
      deadline: { name: "claimNonDeliveryRefund", args: [] },
      prework: { name: "cancelBeforeWork", args: [] },
    };
    setBusy(true);
    try {
      await wallet.switchToArc();
      const receipt = await writeEscrowAction(
        wallet.address,
        agreementData.agreement.contract_address,
        actions[selected.id],
      );
      await syncAgreementTransaction(agreementRef, receipt);
      setRequested(true);
    } catch (recoveryError) {
      setError(
        recoveryError instanceof Error
          ? recoveryError.message
          : "The recovery transaction could not be confirmed.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (requested) {
    return (
      <section className="decision-result">
        <span className="decision-result-icon">
          <CheckCircle2 size={26} />
        </span>
        <p>Cancellation proposed</p>
        <h1>The funds remain locked until both parties agree.</h1>
        <span>
          Duevia recorded the demo proposal and will show the exact refund
          amount before either party confirms.
        </span>
        <div className="decision-note recovery-summary">
          <div>
            <small>Locked balance</small>
            <strong>{locked.toLocaleString()} USDC</strong>
          </div>
          <div>
            <small>Proposed refund</small>
            <strong>{locked.toLocaleString()} USDC</strong>
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
      <header className="recovery-heading">
        <p className="eyebrow">Protected recovery</p>
        <h1>Cancellation & refund paths</h1>
        <p>
          Duevia only exposes a recovery action when its onchain conditions are
          satisfied. Funds never move from a simple support request.
        </p>
      </header>

      <section className="recovery-layout">
        <div className="recovery-options">
          {paths.map((path) => {
            const Icon = path.icon;
            return (
              <button
                className={`recovery-option${selected?.id === path.id ? " active" : ""}`}
                type="button"
                key={path.id}
                disabled={!isAvailable(path.id)}
                onClick={() => setSelected(path)}
              >
                <span className="recovery-icon">
                  <Icon size={20} />
                </span>
                <div>
                  <strong>{path.title}</strong>
                  <p>{path.description}</p>
                  <small>{path.availability}</small>
                </div>
              </button>
            );
          })}
        </div>

        <aside className="recovery-panel">
          <span>Agreement {demoAgreement.publicRef}</span>
          <h2>{selected?.title ?? "Choose a recovery path"}</h2>
          <p>
            {selected
              ? "The proposal does not release or refund funds by itself. The counterparty must approve the same terms."
              : "Select an available option to preview its exact effect."}
          </p>
          <dl>
            <div>
              <dt>Locked</dt>
              <dd>{locked.toLocaleString()} USDC</dd>
            </div>
            <div>
              <dt>Already released</dt>
              <dd>{released.toLocaleString()} USDC</dd>
            </div>
            <div>
              <dt>Network</dt>
              <dd>Arc Testnet</dd>
            </div>
          </dl>
          {selected && (
            <div className="review-warning">
              <AlertTriangle size={16} />
              Both parties must approve. Released milestones are final.
            </div>
          )}
          <button
            className="button button-primary decision-submit"
            type="button"
            disabled={!selected || busy}
            onClick={() => void executeRecovery()}
          >
            {busy
              ? "Confirming on Arc..."
              : selected?.id === "mutual"
                ? "Approve cancellation"
                : "Confirm recovery"}
          </button>
          {error && <div className="form-error" role="alert">{error}</div>}
        </aside>
      </section>
    </>
  );
}
