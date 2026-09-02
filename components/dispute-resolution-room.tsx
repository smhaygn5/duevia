"use client";

import {
  Check,
  ExternalLink,
  FileCheck2,
  FileKey2,
  MessageSquareText,
  Scale,
  ShieldAlert,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DISPUTE_CATEGORIES,
  DISPUTE_RESOLUTIONS,
  disputeDecisionMessage,
  disputeEvidenceMessage,
  disputeOpeningMessage,
  disputeResolutionMessage,
  type DisputeCategory,
  type DisputeResolution,
  type DisputeStatus,
} from "@/lib/agreements/disputes";
import { useWallet } from "./wallet-provider";

type DisputeRecord = {
  id: string;
  category: DisputeCategory;
  status: DisputeStatus;
  proposed_resolution: DisputeResolution | null;
  proposed_by_wallet_id: string | null;
  proposal_event_id: string | null;
  opened_at: number;
  resolved_at: number | null;
  milestone_position: number | null;
  opened_by_role: "client" | "provider";
  proposed_by_role: "client" | "provider" | null;
};

type DisputeEvent = {
  id: string;
  dispute_id: string;
  kind: "opened" | "evidence" | "resolution_proposed" | "resolution_accepted" | "resolution_rejected";
  statement: string;
  evidence_url: string | null;
  evidence_sha256: string | null;
  resolution_type: DisputeResolution | null;
  signature: string;
  occurred_at: number;
  actor_role: "client" | "provider";
  actor_wallet_id: string;
};

type DisputePayload = {
  currentRole?: "client" | "provider";
  disputes?: DisputeRecord[];
  events?: DisputeEvent[];
  message?: string;
  walletId?: string;
};

type RoomMode = "closed" | "open" | "evidence" | "resolution" | "reject";

const categoryLabels: Record<DisputeCategory, string> = {
  scope: "Scope",
  delivery: "Delivery",
  quality: "Quality",
  deadline: "Deadline",
  payment: "Payment",
  other: "Other",
};

const resolutionLabels: Record<DisputeResolution, string> = {
  continue: "Continue under current terms",
  revise: "Revise the work plan",
  cancel: "Cancel by mutual agreement",
  refund_remaining: "Record a remaining balance refund",
  release_current: "Record the current milestone for release",
};

const eventLabels: Record<DisputeEvent["kind"], string> = {
  opened: "Dispute opened",
  evidence: "Evidence added",
  resolution_proposed: "Resolution proposed",
  resolution_accepted: "Resolution accepted",
  resolution_rejected: "Resolution declined",
};

const demoDispute: DisputeRecord = {
  id: "demo-dispute",
  category: "delivery",
  status: "resolution_pending",
  proposed_resolution: "revise",
  proposed_by_wallet_id: "demo-client",
  proposal_event_id: "demo-proposal",
  opened_at: Date.UTC(2026, 6, 22, 9, 15),
  resolved_at: null,
  milestone_position: 2,
  opened_by_role: "client",
  proposed_by_role: "client",
};

const demoEvents: DisputeEvent[] = [
  {
    id: "demo-open",
    dispute_id: demoDispute.id,
    kind: "opened",
    statement: "The final launch files do not yet include the agreed localization package.",
    evidence_url: null,
    evidence_sha256: null,
    resolution_type: null,
    signature: "0x8d24b5e6f1c09f7a",
    occurred_at: demoDispute.opened_at,
    actor_role: "client",
    actor_wallet_id: "demo-client",
  },
  {
    id: "demo-evidence",
    dispute_id: demoDispute.id,
    kind: "evidence",
    statement: "The delivery manifest shows the localization archive is still being prepared.",
    evidence_url: "https://example.com/duevia-demo-evidence",
    evidence_sha256: "2f6bd057a2f81f57476627d07d467836b7ea4763204086a8a363cc3e5f4bdb0b",
    resolution_type: null,
    signature: "0x4ad91e27bc58dce0",
    occurred_at: Date.UTC(2026, 6, 22, 10, 5),
    actor_role: "provider",
    actor_wallet_id: "demo-provider",
  },
  {
    id: "demo-proposal",
    dispute_id: demoDispute.id,
    kind: "resolution_proposed",
    statement: "Extend the delivery window by three days and include the missing archive in the same milestone.",
    evidence_url: null,
    evidence_sha256: null,
    resolution_type: "revise",
    signature: "0xf390ccb1b0784c51",
    occurred_at: Date.UTC(2026, 6, 22, 10, 30),
    actor_role: "client",
    actor_wallet_id: "demo-client",
  },
];

export function DisputeResolutionRoom({
  agreementRef,
  currentRole,
  demo = false,
  milestones,
}: {
  agreementRef: string;
  currentRole: "client" | "provider";
  demo?: boolean;
  milestones: Array<{ position: number; title: string }>;
}) {
  const wallet = useWallet();
  const [disputes, setDisputes] = useState<DisputeRecord[]>(demo ? [demoDispute] : []);
  const [events, setEvents] = useState<DisputeEvent[]>(demo ? demoEvents : []);
  const [walletId, setWalletId] = useState<string | null>(demo ? "demo-provider" : null);
  const [role, setRole] = useState(currentRole);
  const [selectedId, setSelectedId] = useState<string | null>(demo ? demoDispute.id : null);
  const [mode, setMode] = useState<RoomMode>("closed");
  const [loading, setLoading] = useState(!demo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState({
    category: "delivery" as DisputeCategory,
    milestonePosition: "",
    statement: "",
  });
  const [evidenceForm, setEvidenceForm] = useState({ statement: "", evidenceUrl: "", evidenceSha256: "" });
  const [evidenceFileName, setEvidenceFileName] = useState<string | null>(null);
  const [resolutionForm, setResolutionForm] = useState({ resolution: "revise" as DisputeResolution, note: "" });
  const [decisionNote, setDecisionNote] = useState("");

  const load = useCallback(async () => {
    if (demo) return;
    const response = await fetch(`/api/agreements/${agreementRef}/disputes`, { cache: "no-store" });
    const payload = (await response.json()) as DisputePayload;
    if (!response.ok) throw new Error(payload.message ?? "The dispute room could not be loaded.");
    const nextDisputes = payload.disputes ?? [];
    setDisputes(nextDisputes);
    setEvents(payload.events ?? []);
    setWalletId(payload.walletId ?? null);
    setRole(payload.currentRole ?? currentRole);
    setSelectedId((value) => value && nextDisputes.some((item) => item.id === value) ? value : nextDisputes[0]?.id ?? null);
  }, [agreementRef, currentRole, demo]);

  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    void load()
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "The dispute room could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [demo, load]);

  const selected = useMemo(
    () => disputes.find((item) => item.id === selectedId) ?? disputes[0] ?? null,
    [disputes, selectedId],
  );
  const selectedEvents = useMemo(
    () => events.filter((event) => event.dispute_id === selected?.id),
    [events, selected?.id],
  );
  const proposalEvent = selectedEvents.find((event) => event.id === selected?.proposal_event_id) ?? null;
  const hasActiveDispute = disputes.some((item) => item.status !== "resolved");
  const canDecide = Boolean(
    selected?.status === "resolution_pending" &&
    selected.proposed_by_wallet_id &&
    selected.proposed_by_wallet_id !== walletId,
  );

  async function sendSigned(body: Record<string, unknown>, message: string) {
    if (demo) return;
    setBusy(true);
    setError(null);
    try {
      const signature = await wallet.signMessage(message);
      const response = await fetch(`/api/agreements/${agreementRef}/disputes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, signature }),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? "The signed update could not be saved.");
      await load();
      setMode("closed");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The signed update could not be saved.");
      throw reason;
    } finally {
      setBusy(false);
    }
  }

  async function guardSignedAction(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The signed update could not be prepared.");
    }
  }

  async function openDispute() {
    await guardSignedAction(async () => {
      if (!wallet.address) throw new Error("Sign in with the agreement wallet first.");
      const signedAt = Date.now();
      const milestonePosition = openForm.milestonePosition ? Number(openForm.milestonePosition) : null;
      const message = disputeOpeningMessage({
        agreementRef,
        category: openForm.category,
        milestonePosition,
        signedAt,
        signer: wallet.address,
        statement: openForm.statement,
      });
      await sendSigned({ action: "open", ...openForm, milestonePosition, signedAt }, message);
      setOpenForm({ category: "delivery", milestonePosition: "", statement: "" });
    });
  }

  async function addEvidence() {
    await guardSignedAction(async () => {
      if (!wallet.address || !selected) throw new Error("Select an active dispute first.");
      const signedAt = Date.now();
      const evidenceUrl = evidenceForm.evidenceUrl.trim() || null;
      const evidenceSha256 = evidenceForm.evidenceSha256.trim() || null;
      const message = disputeEvidenceMessage({ agreementRef, disputeId: selected.id, evidenceSha256, evidenceUrl, signedAt, signer: wallet.address, statement: evidenceForm.statement });
      await sendSigned({ action: "evidence", disputeId: selected.id, evidenceSha256, evidenceUrl, signedAt, statement: evidenceForm.statement }, message);
      setEvidenceForm({ statement: "", evidenceUrl: "", evidenceSha256: "" });
      setEvidenceFileName(null);
    });
  }

  async function proposeResolution() {
    await guardSignedAction(async () => {
      if (!wallet.address || !selected) throw new Error("Select an active dispute first.");
      const signedAt = Date.now();
      const message = disputeResolutionMessage({ agreementRef, disputeId: selected.id, note: resolutionForm.note, resolution: resolutionForm.resolution, signedAt, signer: wallet.address });
      await sendSigned({ action: "propose", disputeId: selected.id, note: resolutionForm.note, resolution: resolutionForm.resolution, signedAt }, message);
      setResolutionForm({ resolution: "revise", note: "" });
    });
  }

  async function decide(decision: "accept" | "reject") {
    await guardSignedAction(async () => {
      if (!wallet.address || !selected || !proposalEvent) throw new Error("The resolution proposal is unavailable.");
      const signedAt = Date.now();
      const note = decision === "reject" ? decisionNote : null;
      const message = disputeDecisionMessage({ agreementRef, decision, disputeId: selected.id, note, proposalEventId: proposalEvent.id, proposalSignature: proposalEvent.signature, signedAt, signer: wallet.address });
      await sendSigned({ action: decision, disputeId: selected.id, note, signedAt }, message);
      setDecisionNote("");
    });
  }

  async function hashEvidenceFile(file: File | null) {
    if (!file) return;
    setError(null);
    try {
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const value = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      setEvidenceForm((current) => ({ ...current, evidenceSha256: value }));
      setEvidenceFileName(file.name);
    } catch {
      setError("This browser could not create the local file proof.");
    }
  }

  function closeForm() {
    setMode("closed");
    setError(null);
  }

  return (
    <section className="panel dispute-room">
      <header className="panel-header dispute-room-heading">
        <div className="dispute-title-group">
          <span className="dispute-title-icon"><Scale size={17} /></span>
          <div>
            <h2>Dispute resolution room</h2>
            <p>Build a wallet signed record before settlement action is taken.</p>
          </div>
        </div>
        <div className="dispute-heading-actions">
          {demo && <span className="dispute-demo-badge">Demo only</span>}
          {!hasActiveDispute && !demo && (
            <button className="button button-quiet" type="button" onClick={() => setMode("open")}>
              <ShieldAlert size={14} /> Open dispute
            </button>
          )}
        </div>
      </header>

      {loading ? <p className="dispute-empty">Loading the signed record…</p> : null}
      {error ? <div className="form-error dispute-error" role="alert">{error}</div> : null}

      {mode === "open" && !demo ? (
        <div className="dispute-form">
          <div className="dispute-form-heading"><strong>Open a dispute</strong><button type="button" aria-label="Close form" onClick={closeForm}><X size={15} /></button></div>
          <div className="dispute-form-grid">
            <label><span>Category</span><select value={openForm.category} onChange={(event) => setOpenForm({ ...openForm, category: event.target.value as DisputeCategory })}>{DISPUTE_CATEGORIES.map((item) => <option key={item} value={item}>{categoryLabels[item]}</option>)}</select></label>
            <label><span>Related milestone</span><select value={openForm.milestonePosition} onChange={(event) => setOpenForm({ ...openForm, milestonePosition: event.target.value })}><option value="">Agreement level</option>{milestones.map((milestone) => <option key={milestone.position} value={milestone.position}>{milestone.position}. {milestone.title}</option>)}</select></label>
          </div>
          <label><span>Opening statement</span><textarea maxLength={2000} placeholder="Describe the disputed point and the outcome you need." value={openForm.statement} onChange={(event) => setOpenForm({ ...openForm, statement: event.target.value })} /></label>
          <button className="button button-primary" type="button" disabled={busy || openForm.statement.trim().length < 20} onClick={() => void openDispute()}>{busy ? "Waiting for wallet…" : "Sign and open dispute"}</button>
        </div>
      ) : null}

      {!loading && !selected && mode !== "open" ? (
        <div className="dispute-empty-state">
          <FileCheck2 size={23} />
          <strong>No dispute record</strong>
          <p>The agreement continues under its accepted terms. Either party can open a signed room if an issue needs a shared record.</p>
        </div>
      ) : null}

      {selected ? (
        <>
          {disputes.length > 1 ? (
            <div className="dispute-history" aria-label="Dispute history">
              {disputes.map((item, index) => <button className={item.id === selected.id ? "active" : ""} type="button" key={item.id} onClick={() => { setSelectedId(item.id); closeForm(); }}>Case {disputes.length - index} · {categoryLabels[item.category]}</button>)}
            </div>
          ) : null}

          <div className="dispute-overview">
            <div><span>Case</span><strong>{categoryLabels[selected.category]}</strong></div>
            <div><span>Scope</span><strong>{selected.milestone_position ? `Milestone ${selected.milestone_position}` : "Full agreement"}</strong></div>
            <div><span>Opened by</span><strong>{titleCase(selected.opened_by_role)}</strong></div>
            <div><span>Status</span><strong className={`dispute-status ${selected.status}`}>{statusLabel(selected.status)}</strong></div>
          </div>

          <div className="dispute-timeline">
            {selectedEvents.map((event) => (
              <article className="dispute-event" key={event.id}>
                <span className={`dispute-event-icon ${event.kind}`}>
                  {event.kind === "resolution_accepted" ? <Check size={14} /> : event.kind === "resolution_rejected" ? <X size={14} /> : event.kind === "evidence" ? <FileKey2 size={14} /> : <MessageSquareText size={14} />}
                </span>
                <div className="dispute-event-content">
                  <div className="dispute-event-meta"><strong>{eventLabels[event.kind]}</strong><span>{titleCase(event.actor_role)} · {formatDate(event.occurred_at)}</span></div>
                  {event.resolution_type ? <span className="dispute-resolution-label">{resolutionLabels[event.resolution_type]}</span> : null}
                  <p>{event.statement}</p>
                  <div className="dispute-proof-row">
                    {event.evidence_url ? <a href={event.evidence_url} target="_blank" rel="noreferrer">Evidence link <ExternalLink size={11} /></a> : null}
                    {event.evidence_sha256 ? <span title={event.evidence_sha256}>SHA256 · {shortValue(event.evidence_sha256)}</span> : null}
                    <span title={event.signature}>Signed · {shortValue(event.signature)}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {selected.status !== "resolved" && mode === "closed" && !demo ? (
            <div className="dispute-actions">
              <button className="button button-quiet" type="button" onClick={() => setMode("evidence")}>Add evidence</button>
              {selected.status === "open" ? <button className="button button-primary" type="button" onClick={() => setMode("resolution")}>Propose resolution</button> : null}
            </div>
          ) : null}

          {mode === "evidence" && !demo ? (
            <div className="dispute-form">
              <div className="dispute-form-heading"><strong>Add signed evidence</strong><button type="button" aria-label="Close form" onClick={closeForm}><X size={15} /></button></div>
              <label><span>Evidence note</span><textarea maxLength={2000} placeholder="Explain what this evidence shows." value={evidenceForm.statement} onChange={(event) => setEvidenceForm({ ...evidenceForm, statement: event.target.value })} /></label>
              <label><span>HTTPS evidence link, optional</span><input type="url" placeholder="https://" value={evidenceForm.evidenceUrl} onChange={(event) => setEvidenceForm({ ...evidenceForm, evidenceUrl: event.target.value })} /></label>
              <label className="dispute-file-proof"><span>Local file proof, optional</span><input type="file" onChange={(event) => void hashEvidenceFile(event.target.files?.[0] ?? null)} /><small>{evidenceFileName ? `${evidenceFileName} hashed locally. The file is not uploaded.` : "Duevia stores only a SHA256 fingerprint. The file never leaves this device."}</small></label>
              {evidenceForm.evidenceSha256 ? <code className="dispute-hash">{evidenceForm.evidenceSha256}</code> : null}
              <button className="button button-primary" type="button" disabled={busy || evidenceForm.statement.trim().length < 8} onClick={() => void addEvidence()}>{busy ? "Waiting for wallet…" : "Sign evidence record"}</button>
            </div>
          ) : null}

          {mode === "resolution" && selected.status === "open" && !demo ? (
            <div className="dispute-form">
              <div className="dispute-form-heading"><strong>Propose a resolution</strong><button type="button" aria-label="Close form" onClick={closeForm}><X size={15} /></button></div>
              <label><span>Resolution</span><select value={resolutionForm.resolution} onChange={(event) => setResolutionForm({ ...resolutionForm, resolution: event.target.value as DisputeResolution })}>{DISPUTE_RESOLUTIONS.map((item) => <option key={item} value={item}>{resolutionLabels[item]}</option>)}</select></label>
              <label><span>Proposal note</span><textarea maxLength={2000} placeholder="State the exact outcome the other party should accept." value={resolutionForm.note} onChange={(event) => setResolutionForm({ ...resolutionForm, note: event.target.value })} /></label>
              <button className="button button-primary" type="button" disabled={busy || resolutionForm.note.trim().length < 12} onClick={() => void proposeResolution()}>{busy ? "Waiting for wallet…" : "Sign resolution proposal"}</button>
            </div>
          ) : null}

          {selected.status === "resolution_pending" ? (
            <div className="dispute-resolution-card">
              <div><span>Proposed outcome</span><strong>{selected.proposed_resolution ? resolutionLabels[selected.proposed_resolution] : "Resolution pending"}</strong><p>{demo ? "In a live agreement, the counterparty wallet would sign the final decision." : canDecide ? `The ${selected.proposed_by_role} signed this proposal. Your wallet must decide it.` : "Waiting for the other party to accept or decline this signed proposal."}</p></div>
              {canDecide && !demo && mode !== "reject" ? <div className="dispute-decision-actions"><button className="button button-quiet" type="button" onClick={() => setMode("reject")}>Decline</button><button className="button button-primary" type="button" disabled={busy} onClick={() => void decide("accept")}>{busy ? "Waiting for wallet…" : "Sign and accept"}</button></div> : null}
              {canDecide && mode === "reject" && !demo ? <div className="dispute-reject-form"><textarea maxLength={2000} placeholder="Explain what should change before a new proposal." value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} /><div><button className="button button-quiet" type="button" onClick={closeForm}>Cancel</button><button className="button button-primary" type="button" disabled={busy || decisionNote.trim().length < 8} onClick={() => void decide("reject")}>{busy ? "Waiting for wallet…" : "Sign and decline"}</button></div></div> : null}
            </div>
          ) : null}

          {selected.status === "resolved" ? <div className="dispute-resolved"><Check size={15} /><span><strong>Mutually resolved</strong>The accepted outcome and both wallet signatures remain available in this read only record.</span></div> : null}
        </>
      ) : null}

      <small className="dispute-disclaimer">Signed dispute records are coordination evidence, not an onchain ruling. They never release, refund, or move USDC automatically. Any settlement or recovery action remains a separate explicit transaction.</small>
    </section>
  );
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}

function statusLabel(value: DisputeStatus) {
  if (value === "resolution_pending") return "Resolution pending";
  return titleCase(value);
}

function formatDate(value: number) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function shortValue(value: string) {
  return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
}
