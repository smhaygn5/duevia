"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileCheck2,
  Home,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { demoAgreement } from "@/lib/demo-data";
import { DueviaLogo } from "./duevia-logo";
import { ThemeToggle } from "./theme-toggle";
import { WalletButton } from "./wallet-button";
import { useWallet } from "./wallet-provider";

type InvitationData = {
  agreement: {
    publicRef: string;
    title: string;
    creatorRole: "client" | "provider";
    creatorAddress: string;
    creatorName: string | null;
    counterpartyName: string;
    totalAmount: string;
    state: string;
    accepted: boolean;
  };
  milestones: Array<{
    position: number;
    title: string;
    description: string;
    amount: string;
    due_at: number;
    review_window_seconds: number;
    revision_limit: number;
  }>;
};

const demoInvitation: InvitationData = {
  agreement: {
    publicRef: demoAgreement.publicRef,
    title: demoAgreement.title,
    creatorRole: "provider",
    creatorAddress: "0x91D40000000000000000000000000000000042A7",
    creatorName: "Orbit Studio",
    counterpartyName: "Northstar Labs",
    totalAmount: "4500",
    state: "awaiting_funding",
    accepted: false,
  },
  milestones: demoAgreement.milestones.map((milestone) => ({
    position: milestone.position,
    title: milestone.title,
    description: milestone.description,
    amount: milestone.amount.replace(",", ""),
    due_at: Date.parse(milestone.due),
    review_window_seconds: milestone.reviewDays * 86_400,
    revision_limit: milestone.revisionLimit,
  })),
};

function InvitationNavigation() {
  const router = useRouter();

  function goBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  }

  return (
    <nav className="invite-nav" aria-label="Invitation navigation">
      <div className="invite-nav-start">
        <button className="invite-back" type="button" onClick={goBack}>
          <ArrowLeft size={15} />
          Back
        </button>
        <Link className="wordmark" href="/" aria-label="Duevia home">
          <DueviaLogo compactOnMobile />
        </Link>
      </div>
      <div className="invite-nav-actions">
        <Link className="invite-workspace-link" href="/app">
          <Home size={14} />
          Workspace
        </Link>
        <span className="network-chip">
          <i />
          Arc Testnet
        </span>
        <ThemeToggle />
        <WalletButton />
      </div>
    </nav>
  );
}

export function InvitationView({ token }: { token: string }) {
  const wallet = useWallet();
  const isDemo = token === "demo";
  const [data, setData] = useState<InvitationData | null>(
    isDemo ? demoInvitation : null,
  );
  const [loading, setLoading] = useState(!isDemo);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<"accepted" | "declined" | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isDemo) return;
    void fetch(`/api/invitations/${token}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    })
      .then(async (response) => {
        const payload = (await response.json()) as InvitationData & {
          message?: string;
        };
        if (!response.ok) {
          throw new Error(payload.message ?? "Invitation not found.");
        }
        setData(payload);
      })
      .catch((fetchError: unknown) =>
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Invitation not found.",
        ),
      )
      .finally(() => setLoading(false));
  }, [isDemo, token]);

  async function accept() {
    if (!wallet.authenticated) {
      setError("Connect, switch to Arc, and sign in before accepting.");
      return;
    }
    if (isDemo) {
      setDecision("accepted");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/invitations/${token}`, {
        method: "POST",
        signal: AbortSignal.timeout(15_000),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? "Unable to accept.");
      setDecision("accepted");
    } catch (acceptError) {
      setError(
        acceptError instanceof Error
          ? acceptError.message
          : "Unable to accept invitation.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="invite-page">
        <InvitationNavigation />
        <div className="invite-state">Loading invitation…</div>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="invite-page">
        <InvitationNavigation />
        <div className="invite-state">
          <h1>Invitation unavailable</h1>
          <p>{error}</p>
          <Link className="button button-primary" href="/">
            Return home
          </Link>
        </div>
      </main>
    );
  }

  if (decision) {
    const accepted = decision === "accepted";
    return (
      <div className="invite-page">
        <InvitationNavigation />
        <main className="invite-decision">
          <div className={`decision-icon ${accepted ? "accepted" : "declined"}`}>
            {accepted ? <Check size={30} /> : <X size={30} />}
          </div>
          <p>
            {accepted
              ? isDemo
                ? "Demo invitation previewed"
                : "Agreement accepted"
              : "Invitation declined"}
          </p>
          <h1>{data.agreement.title}</h1>
          <span>
            {accepted
              ? isDemo
                ? "This demo choice was not saved and your wallet was not linked."
                : "Your wallet is now linked to the agreement."
              : "No wallet action or transaction was created."}
          </span>
          <div className="decision-ticket">
            <div>
              <small>Agreement</small>
              <strong>{data.agreement.publicRef}</strong>
            </div>
            <div>
              <small>Total</small>
              <strong>
                {Number(data.agreement.totalAmount).toLocaleString()} USDC
              </strong>
            </div>
            <div>
              <small>Network</small>
              <strong>Arc Testnet</strong>
            </div>
          </div>
          <Link
            className="button button-primary"
            href={
              accepted
                ? `/app/agreements/${data.agreement.publicRef.toLowerCase()}`
                : "/"
            }
          >
            {accepted
              ? isDemo
                ? "Continue demo"
                : "Open agreement"
              : "Return home"}
            <ArrowRight size={16} />
          </Link>
        </main>
      </div>
    );
  }

  return (
    <main className="invite-page">
      <InvitationNavigation />

      <header className="invite-header">
        <p>You’ve been invited to a Duevia agreement</p>
        <h1>{data.agreement.title}</h1>
        <span>
          {data.agreement.creatorName ??
            `${data.agreement.creatorAddress.slice(0, 6)}…${data.agreement.creatorAddress.slice(-4)}`}{" "}
          prepared clear milestone terms for you.
        </span>
      </header>

      {isDemo && (
        <div className="workspace-disclosure workspace-disclosure-demo">
          <strong>Guided demo · fictional invitation</strong>
          <span>
            This invitation demonstrates the acceptance flow only. It does not
            create an agreement, link a wallet, or move USDC.
          </span>
        </div>
      )}

      <section className="invite-summary">
        <div>
          <small>Agreement</small>
          <strong>{data.agreement.publicRef}</strong>
        </div>
        <div>
          <small>Total funding</small>
          <strong>
            {Number(data.agreement.totalAmount).toLocaleString()} USDC
          </strong>
        </div>
        <div>
          <small>Review terms</small>
          <strong>
            {data.milestones[0]?.review_window_seconds
              ? data.milestones[0].review_window_seconds / 86_400
              : 3}{" "}
            days
          </strong>
        </div>
        <div>
          <small>Work starts</small>
          <strong>After funding</strong>
        </div>
      </section>

      <section className="invite-milestones">
        <div className="section-heading compact-heading">
          <p className="eyebrow">Agreement scope</p>
          <h2>Three clear stages. One settlement path.</h2>
        </div>
        <div className="invite-milestone-grid">
          {data.milestones.map((milestone) => (
            <article key={milestone.position}>
              <span>{String(milestone.position).padStart(2, "0")}</span>
              <h3>{milestone.title}</h3>
              <strong>{Number(milestone.amount).toLocaleString()} USDC</strong>
              <p>{milestone.description}</p>
              <small>
                Due{" "}
                {new Date(milestone.due_at).toLocaleDateString("en", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </small>
            </article>
          ))}
        </div>
      </section>

      <section className="invite-assurance">
        <div>
          <ShieldCheck size={20} />
          <span>
            <strong>No transaction on acceptance</strong>
            Funding is a separate, explicit wallet action.
          </span>
        </div>
        <div>
          <FileCheck2 size={20} />
          <span>
            <strong>Terms remain visible</strong>
            Milestones and release rules stay attached to the agreement.
          </span>
        </div>
      </section>

      {error && <div className="invite-error" role="alert">{error}</div>}
      <footer className="invite-actions">
        <button
          className="button button-danger-quiet"
          type="button"
          onClick={() => setDecision("declined")}
        >
          Decline
        </button>
        <button
          className="button button-primary"
          type="button"
          onClick={() => void accept()}
          disabled={busy || data.agreement.accepted}
        >
          {data.agreement.accepted
            ? "Already accepted"
            : busy
              ? "Accepting…"
              : "Accept agreement"}
          {!data.agreement.accepted && <ArrowRight size={16} />}
        </button>
      </footer>
    </main>
  );
}
