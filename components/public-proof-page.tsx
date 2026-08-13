"use client";

import { CheckCircle2, ExternalLink, FileCheck2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ARC } from "@/lib/arc/config";
import { proofStateLabel } from "@/lib/agreements/public-proof";

type ProofPayload = {
  agreement: {
    publicRef: string;
    title: string;
    state: string;
    contractAddress: string | null;
    fundedTxHash: string | null;
    total: string;
    createdAt: number;
  };
  milestones: Array<{
    position: number;
    title: string;
    amount: string;
    dueAt: number;
    state: string;
    releasedTxHash: string | null;
  }>;
  activities: Array<{
    type: string;
    txHash: string;
    occurredAt: number;
    milestonePosition: number | null;
  }>;
};

function eventLabel(type: string) {
  return proofStateLabel(type.replace(".", "_"));
}

export function PublicProofPage({ agreementRef }: { agreementRef: string }) {
  const [proof, setProof] = useState<ProofPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`/api/proof/${agreementRef}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as ProofPayload & {
          message?: string;
        };
        if (!response.ok || !payload.agreement) {
          throw new Error(payload.message ?? "This public proof is unavailable.");
        }
        setProof(payload);
      })
      .catch((proofError: unknown) =>
        setError(
          proofError instanceof Error
            ? proofError.message
            : "This public proof is unavailable.",
        ),
      );
  }, [agreementRef]);

  if (error) {
    return (
      <main className="public-proof-shell">
        <section className="public-proof-state">
          <ShieldCheck size={30} />
          <h1>Proof unavailable</h1>
          <p>{error}</p>
          <Link className="button button-quiet" href="/">Visit Duevia</Link>
        </section>
      </main>
    );
  }
  if (!proof) {
    return <main className="public-proof-shell"><p>Loading verified proof…</p></main>;
  }

  const released = proof.milestones.filter((milestone) => milestone.state === "released");
  return (
    <main className="public-proof-shell">
      <header className="public-proof-nav">
        <Link href="/" className="public-proof-brand">Duevia</Link>
        <span>Public proof · Arc Testnet</span>
      </header>
      <section className="public-proof-hero">
        <span className="proof-mark"><ShieldCheck size={22} /></span>
        <p>VERIFIABLE AGREEMENT</p>
        <h1>{proof.agreement.title}</h1>
        <span>{proof.agreement.publicRef} · {proofStateLabel(proof.agreement.state)}</span>
      </section>

      <section className="public-proof-summary">
        <div><span>Agreement total</span><strong>{Number(proof.agreement.total).toLocaleString()} USDC</strong></div>
        <div><span>Milestones</span><strong>{proof.milestones.length}</strong></div>
        <div><span>Released</span><strong>{released.length} verified</strong></div>
      </section>

      <section className="public-proof-card">
        <header><div><h2>Milestone record</h2><p>Amounts and settlement state, without exposing party or delivery data.</p></div><FileCheck2 size={19} /></header>
        <div className="public-proof-milestones">
          {proof.milestones.map((milestone) => (
            <article key={milestone.position}>
              <span className={milestone.state === "released" ? "released" : ""}>
                {milestone.state === "released" ? <CheckCircle2 size={14} /> : milestone.position}
              </span>
              <div><small>Milestone {String(milestone.position).padStart(2, "0")} · {proofStateLabel(milestone.state)}</small><h3>{milestone.title}</h3><p>Due {new Date(milestone.dueAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</p></div>
              <div className="public-proof-amount"><strong>{Number(milestone.amount).toLocaleString()} USDC</strong>{milestone.releasedTxHash && <a href={`${ARC.explorerUrl}/tx/${milestone.releasedTxHash}`} target="_blank" rel="noreferrer">Arc proof <ExternalLink size={12} /></a>}</div>
            </article>
          ))}
        </div>
      </section>

      <section className="public-proof-card">
        <header><div><h2>Verified Arc activity</h2><p>Every entry below links to an onchain transaction.</p></div><ShieldCheck size={19} /></header>
        <div className="public-proof-events">
          {proof.activities.length ? proof.activities.map((activity, index) => <a key={`${activity.txHash}-${index}`} href={`${ARC.explorerUrl}/tx/${activity.txHash}`} target="_blank" rel="noreferrer"><span><CheckCircle2 size={14} /></span><div><strong>{eventLabel(activity.type)}</strong><small>{new Date(activity.occurredAt).toLocaleString("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })}</small></div><ExternalLink size={14} /></a>) : <p>No verified Arc transactions have been recorded yet.</p>}
        </div>
      </section>
      <footer className="public-proof-footer">This read-only page exposes settlement evidence only. It never exposes wallet addresses, private delivery files, or review notes.</footer>
    </main>
  );
}
