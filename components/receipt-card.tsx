"use client";

import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileDown,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ARC } from "@/lib/arc/config";
import { demoReceipt } from "@/lib/demo-data";

type ReceiptModel = {
  status: string;
  title: string;
  description: string;
  agreement: string;
  agreementTitle?: string;
  milestone: string;
  amount: string;
  recipient: string | null;
  network: string;
  date: string;
  txHash: string;
  approvalChecklist?: readonly string[];
};

export function ReceiptCard({ receiptId }: { receiptId: string }) {
  const isDemo = receiptId === "demo";
  const [copied, setCopied] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptModel | null>(
    isDemo ? demoReceipt : null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isDemo) return;
    void fetch(`/api/receipts/${receiptId}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as {
          receipt?: ReceiptModel;
          message?: string;
        };
        if (!response.ok || !payload.receipt) {
          throw new Error(payload.message ?? "Receipt not found.");
        }
        setReceipt(payload.receipt);
      })
      .catch((loadError: unknown) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Receipt could not be loaded.",
        ),
      );
  }, [isDemo, receiptId]);

  if (!receipt) {
    return (
      <div className="page-state error-state">
        <h1>{error ? "Receipt unavailable" : "Verifying Arc receipt..."}</h1>
        {error && <p>{error}</p>}
        <Link className="button button-quiet" href="/app/agreements">
          Back to agreements
        </Link>
      </div>
    );
  }

  const explorerUrl = isDemo
    ? null
    : `${ARC.explorerUrl}/tx/${receipt.txHash}`;
  const recipient = receipt.recipient
    ? `${receipt.recipient.slice(0, 8)}…${receipt.recipient.slice(-6)}`
    : "Recorded onchain";

  async function copyHash() {
    await navigator.clipboard.writeText(receipt!.txHash);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_600);
  }

  return (
    <div className="receipt-page">
      <Link
        className="page-back"
        href={`/app/agreements/${receipt.agreement.toLowerCase()}`}
      >
        <ArrowLeft size={15} />
        Agreement
      </Link>
      <section className="receipt-card">
        <div className="receipt-check">
          <CheckCircle2 size={34} />
        </div>
        <span className="receipt-kicker">
          {isDemo ? "Demo receipt" : receipt.status}
        </span>
        <h1>{receipt.title}</h1>
        <p>{receipt.description}</p>

        <div className="receipt-rule" />
        <dl className="receipt-details">
          <div>
            <dt>Agreement</dt>
            <dd>{receipt.agreement}</dd>
          </div>
          <div className="receipt-amount">
            <dt>Amount</dt>
            <dd>{receipt.amount}</dd>
          </div>
          <div>
            <dt>Milestone</dt>
            <dd>{receipt.milestone}</dd>
          </div>
          <div>
            <dt>Date & time</dt>
            <dd>{receipt.date}</dd>
          </div>
          <div>
            <dt>Recipient</dt>
            <dd>{recipient}</dd>
          </div>
          <div>
            <dt>Network</dt>
            <dd>{receipt.network}</dd>
          </div>
        </dl>

        <div className="receipt-hash">
          <span>{isDemo ? "Proof status" : "Transaction proof"}</span>
          <code>
            {isDemo ? "No transaction was broadcast · demo only" : receipt.txHash}
          </code>
          {!isDemo && (
            <button type="button" onClick={() => void copyHash()}>
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? "Copied" : "Copy hash"}
            </button>
          )}
        </div>

        {receipt.approvalChecklist && receipt.approvalChecklist.length > 0 && (
          <div className="receipt-checklist">
            <span>Approval checklist</span>
            <ul>
              {receipt.approvalChecklist.map((item) => (
                <li key={item}>
                  <Check size={13} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {isDemo && (
          <div className="demo-disclosure">
            This receipt illustrates the verified settlement state. No real
            transaction was broadcast.
          </div>
        )}

        <div className="receipt-actions">
          <button
            className="button button-quiet"
            type="button"
            onClick={() => window.print()}
          >
            <FileDown size={16} />
            Print receipt
          </button>
          {explorerUrl ? (
            <a
              className="button button-primary"
              href={explorerUrl}
              target="_blank"
              rel="noreferrer"
            >
              View on ArcScan
              <ExternalLink size={15} />
            </a>
          ) : (
            <button className="button button-primary" type="button" disabled>
              Explorer unavailable in demo
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
