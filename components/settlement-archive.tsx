"use client";

import { ArrowRight, CheckCircle2, FileDown, FolderArchive, Search, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { demoReceipt } from "@/lib/demo-data";
import { useWallet } from "./wallet-provider";

type ArchiveReceipt = { txHash: string; title: string; agreement: string; agreementTitle: string; milestone: string; amount: string; occurredAt: number; kind: string };

type ReceiptFilter = "all" | "release" | "refund";

function receiptFilterKind(receipt: ArchiveReceipt): Exclude<ReceiptFilter, "all"> {
  return receipt.kind === "agreement.refunded" || receipt.kind === "agreement.cancelled" ? "refund" : "release";
}

export function SettlementArchive() {
  const wallet = useWallet();
  const [receipts, setReceipts] = useState<ArchiveReceipt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ReceiptFilter>("all");
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

  const demo = [{ txHash: "demo", title: demoReceipt.title, agreement: demoReceipt.agreement, agreementTitle: "Global Product Launch", milestone: demoReceipt.milestone, amount: demoReceipt.amount, occurredAt: Date.parse("2026-07-15T14:18:00.000Z"), kind: "milestone.released" }];
  const items = wallet.authenticated ? receipts : demo;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredItems = items?.filter((receipt) => {
    const searchable = [receipt.title, receipt.agreement, receipt.agreementTitle, receipt.milestone, receipt.txHash, receipt.amount].join(" ").toLocaleLowerCase();
    return (filter === "all" || receiptFilterKind(receipt) === filter) && (!normalizedQuery || searchable.includes(normalizedQuery));
  });
  const hasFilters = Boolean(query) || filter !== "all";
  return <>
    <div className="archive-heading"><div><p className="eyebrow"><FolderArchive size={14} /> Settlement archive</p><h1>Receipts, ready when you need them.</h1><p>Return to a verified Arc settlement, download its record, or save it as PDF.</p></div></div>
    {!wallet.authenticated && <div className="workspace-disclosure workspace-disclosure-demo"><strong>Guided demo · no real funds</strong><span>The receipt below is illustrative. Connect a wallet to access your verified settlement archive.</span></div>}
    {wallet.authenticated && !receipts && !error && <div className="workspace-disclosure"><strong>Loading settlement archive</strong><span>Reading verified Arc settlement records.</span></div>}
    {error && <div className="workspace-disclosure workspace-disclosure-error"><strong>Settlement archive is temporarily unavailable</strong><span>{error}</span></div>}
    {items && <section className="panel settlement-archive-list"><header className="panel-header"><div><h2>{wallet.authenticated ? "Verified settlements" : "Demo settlement"}</h2><p>{items.length ? `${items.length} receipt${items.length === 1 ? "" : "s"} available.` : "No settlement receipts have been created yet."}</p></div><FileDown size={18} /></header>
      <div className="receipt-archive-filters">
        <label className="receipt-archive-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search agreement or transaction" aria-label="Search receipt archive" /></label>
        <div className="receipt-archive-tabs" aria-label="Filter receipts by outcome">
          {(["all", "release", "refund"] as ReceiptFilter[]).map((value) => <button key={value} type="button" className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "all" ? "All" : value === "release" ? "Releases" : "Refunds"}</button>)}
        </div>
        <span className="receipt-archive-proof"><ShieldCheck size={14} /> Arc proof attached</span>
        {hasFilters && <button type="button" className="receipt-archive-clear" onClick={() => { setQuery(""); setFilter("all"); }}><X size={14} /> Clear</button>}
      </div>
      <div className="receipt-archive-results"><span>{filteredItems?.length ?? 0} shown</span>{filteredItems?.length !== items.length && <span>of {items.length} receipts</span>}</div>
      <div className="receipt-archive-rows">{filteredItems?.map((receipt) => <Link key={receipt.txHash} className="settlement-archive-row" href={`/app/receipts/${receipt.txHash}`}><span><CheckCircle2 size={17} /></span><div><small>{receipt.agreement} · {receipt.milestone}</small><strong>{receipt.title}</strong><p>{receipt.agreementTitle}</p></div><div><strong>{receipt.amount}</strong><small>{new Date(receipt.occurredAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</small></div><ArrowRight size={16} /></Link>)}{filteredItems?.length === 0 && <div className="receipt-archive-empty"><strong>No receipts match this view.</strong><span>Try a different agreement, transaction reference, or outcome filter.</span></div>}</div></section>}
  </>;
}
