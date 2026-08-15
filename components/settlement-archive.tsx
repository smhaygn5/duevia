"use client";

import { ArrowRight, CheckCircle2, FileDown, FolderArchive } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { demoReceipt } from "@/lib/demo-data";
import { useWallet } from "./wallet-provider";

type ArchiveReceipt = { txHash: string; title: string; agreement: string; agreementTitle: string; milestone: string; amount: string; occurredAt: number };

export function SettlementArchive() {
  const wallet = useWallet();
  const [receipts, setReceipts] = useState<ArchiveReceipt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!wallet.authenticated) return;
    let active = true;
    void fetch("/api/receipts", { cache: "no-store" }).then(async (response) => {
      const payload = (await response.json()) as { receipts?: ArchiveReceipt[]; message?: string };
      if (!response.ok) throw new Error(payload.message ?? "Settlement archive could not be loaded.");
      if (active) setReceipts(payload.receipts ?? []);
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Settlement archive could not be loaded."); });
    return () => { active = false; };
  }, [wallet.authenticated]);

  const demo = [{ txHash: "demo", title: demoReceipt.title, agreement: demoReceipt.agreement, agreementTitle: "Global Product Launch", milestone: demoReceipt.milestone, amount: demoReceipt.amount, occurredAt: Date.parse("2026-07-15T14:18:00.000Z") }];
  const items = wallet.authenticated ? receipts : demo;
  return <>
    <div className="archive-heading"><div><p className="eyebrow"><FolderArchive size={14} /> Settlement archive</p><h1>Receipts, ready when you need them.</h1><p>Return to a verified Arc settlement, download its record, or save it as PDF.</p></div></div>
    {!wallet.authenticated && <div className="workspace-disclosure workspace-disclosure-demo"><strong>Guided demo · no real funds</strong><span>The receipt below is illustrative. Connect a wallet to access your verified settlement archive.</span></div>}
    {wallet.authenticated && !receipts && !error && <div className="workspace-disclosure"><strong>Loading settlement archive</strong><span>Reading verified Arc settlement records.</span></div>}
    {error && <div className="workspace-disclosure workspace-disclosure-error"><strong>Settlement archive is temporarily unavailable</strong><span>{error}</span></div>}
    {items && <section className="panel settlement-archive-list"><header className="panel-header"><div><h2>{wallet.authenticated ? "Verified settlements" : "Demo settlement"}</h2><p>{items.length ? `${items.length} receipt${items.length === 1 ? "" : "s"} available.` : "No settlement receipts have been created yet."}</p></div><FileDown size={18} /></header><div>{items.map((receipt) => <Link key={receipt.txHash} className="settlement-archive-row" href={`/app/receipts/${receipt.txHash}`}><span><CheckCircle2 size={17} /></span><div><small>{receipt.agreement} · {receipt.milestone}</small><strong>{receipt.title}</strong><p>{receipt.agreementTitle}</p></div><div><strong>{receipt.amount}</strong><small>{new Date(receipt.occurredAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</small></div><ArrowRight size={16} /></Link>)}</div></section>}
  </>;
}
