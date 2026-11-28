"use client";

import { Check, ExternalLink, ShieldCheck, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { isAddress, type Address } from "viem";
import { ARC } from "@/lib/arc/config";
import { formatContractError, readEscrowPayoutRecipient, writeEscrowAction } from "@/lib/contracts/duevia";
import { useWallet } from "./wallet-provider";

type Support = "checking" | "supported" | "unavailable";

export function PayoutRecipientPanel({ escrow }: { escrow: Address }) {
  const wallet = useWallet();
  const [support, setSupport] = useState<Support>("checking");
  const [current, setCurrent] = useState<Address | null>(null);
  const [recipient, setRecipient] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void readEscrowPayoutRecipient(escrow)
      .then((address) => {
        if (!cancelled) {
          setCurrent(address);
          setRecipient(address);
          setSupport("supported");
        }
      })
      .catch(() => {
        if (!cancelled) setSupport("unavailable");
      });
    return () => { cancelled = true; };
  }, [escrow]);

  async function save() {
    if (!wallet.address) {
      setMessage("Connect and sign in with the provider wallet first.");
      return;
    }
    if (!isAddress(recipient)) {
      setMessage("Enter a valid EVM wallet address.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const receipt = await writeEscrowAction(wallet.address, escrow, {
        name: "setPayoutRecipient",
        args: [recipient],
      });
      setCurrent(recipient);
      setMessage("Future milestone releases will use this wallet.");
      window.open(`${ARC.explorerUrl}/tx/${receipt.transactionHash}`, "_blank", "noopener,noreferrer");
    } catch (error) {
      setMessage(formatContractError(error, "The payout recipient could not be updated. Check the connected provider wallet and try again."));
    } finally {
      setBusy(false);
    }
  }

  if (support === "unavailable") return null;
  return <section className="panel payout-recipient-panel">
    <header className="panel-header"><div><h2>Release recipient</h2><p>Choose the wallet that receives future approved USDC releases.</p></div><WalletCards size={18} /></header>
    {support === "checking" ? <p className="payout-recipient-loading">Checking this escrow’s payout configuration…</p> : <>
      <div className="payout-recipient-current"><span>Current recipient</span><strong>{current ? `${current.slice(0, 8)}…${current.slice(-6)}` : "Unavailable"}</strong>{current && <a href={`${ARC.explorerUrl}/address/${current}`} target="_blank" rel="noreferrer">View wallet <ExternalLink size={12} /></a>}</div>
      <label className="field"><span>Future release wallet</span><input value={recipient} spellCheck={false} onChange={(event) => setRecipient(event.target.value.trim())} placeholder="0x…" /></label>
      <div className="payout-recipient-actions"><div><ShieldCheck size={15} /><small>Only the provider can change this. It does not change delivery authority or move funds.</small></div><button className="button button-secondary" type="button" disabled={busy || !recipient || recipient.toLowerCase() === current?.toLowerCase()} onClick={() => void save()}>{busy ? "Updating…" : "Update recipient"}</button></div>
      {message && <p className="payout-recipient-message"><Check size={14} />{message}</p>}
    </>}
  </section>;
}
