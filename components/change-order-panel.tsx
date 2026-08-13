"use client";

import { Check, FilePenLine, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { canAcceptChangeOrder } from "@/lib/agreements/change-order";

type ChangeOrder = {
  id: string;
  proposer_wallet_id: string;
  accepted_by_wallet_id: string | null;
  title: string;
  detail: string;
  scope: "scope" | "timeline" | "delivery" | "commercial";
  status: "pending" | "accepted";
  created_at: number;
};

export function ChangeOrderPanel({ agreementRef }: { agreementRef: string }) {
  const [orders, setOrders] = useState<ChangeOrder[]>([]);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", detail: "", scope: "scope" });

  async function load() {
    const response = await fetch(`/api/agreements/${agreementRef}/change-orders`, { cache: "no-store" });
    const payload = (await response.json()) as { orders?: ChangeOrder[]; walletId?: string };
    if (!response.ok) throw new Error("Change orders could not be loaded.");
    setOrders(payload.orders ?? []);
    setWalletId(payload.walletId ?? null);
  }
  useEffect(() => {
    let cancelled = false;
    async function loadInitialOrders() {
      try {
        const response = await fetch(`/api/agreements/${agreementRef}/change-orders`, { cache: "no-store" });
        const payload = (await response.json()) as { orders?: ChangeOrder[]; walletId?: string };
        if (!response.ok) throw new Error("Change orders could not be loaded.");
        if (!cancelled) {
          setOrders(payload.orders ?? []);
          setWalletId(payload.walletId ?? null);
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Change orders could not be loaded.");
      }
    }
    void loadInitialOrders();
    return () => { cancelled = true; };
  }, [agreementRef]);

  async function create() {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/agreements/${agreementRef}/change-orders`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create", ...form }) });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? "Change order could not be created.");
      setForm({ title: "", detail: "", scope: "scope" }); setOpen(false); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Change order could not be created."); } finally { setBusy(false); }
  }
  async function accept(id: string) {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/agreements/${agreementRef}/change-orders`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "accept", id }) });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? "Change order could not be accepted.");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Change order could not be accepted."); } finally { setBusy(false); }
  }
  return <section className="panel change-order-panel">
    <header className="panel-header"><div><h2>Mutual change orders</h2><p>Record scope or delivery changes before work continues.</p></div><button className="text-link" type="button" onClick={() => setOpen((value) => !value)}><Plus size={13} /> New change</button></header>
    {open && <div className="change-order-form"><input value={form.title} placeholder="Change title" onChange={(event) => setForm({ ...form, title: event.target.value })} /><select value={form.scope} onChange={(event) => setForm({ ...form, scope: event.target.value })}><option value="scope">Scope</option><option value="timeline">Timeline</option><option value="delivery">Delivery</option><option value="commercial">Commercial</option></select><textarea value={form.detail} placeholder="Describe what both parties are agreeing to." onChange={(event) => setForm({ ...form, detail: event.target.value })} /><button className="button button-primary" type="button" disabled={busy} onClick={() => void create()}>{busy ? "Saving…" : "Send for approval"}</button></div>}
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="change-order-list">{orders.length ? orders.map((order) => <article key={order.id}><span className={order.status === "accepted" ? "accepted" : ""}>{order.status === "accepted" ? <Check size={14} /> : <FilePenLine size={14} />}</span><div><small>{order.scope} · {order.status === "accepted" ? "Mutually accepted" : "Awaiting counterparty"}</small><strong>{order.title}</strong><p>{order.detail}</p></div>{canAcceptChangeOrder(order.proposer_wallet_id, walletId, order.status) && <button className="button button-quiet" type="button" disabled={busy} onClick={() => void accept(order.id)}>Accept</button>}</article>) : <p className="change-order-empty">No proposed changes. The current agreement remains in effect.</p>}</div>
    <small className="change-order-note">Change orders create a mutual workspace record. They do not alter already locked onchain USDC or escrow terms.</small>
  </section>;
}
