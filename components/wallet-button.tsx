"use client";

import { AlertCircle, Check, ChevronDown, Wallet } from "lucide-react";
import { ARC } from "@/lib/arc/config";
import { useWallet } from "./wallet-provider";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function WalletButton() {
  const wallet = useWallet();
  const wrongNetwork =
    wallet.address !== null && wallet.chainId !== null && wallet.chainId !== ARC.chainId;

  let label = "Connect wallet";
  let action = wallet.connect;
  if (wallet.address && wrongNetwork) {
    label = "Switch to Arc";
    action = wallet.switchToArc;
  } else if (wallet.address && !wallet.authenticated) {
    label = "Sign in";
    action = wallet.signIn;
  } else if (wallet.address && wallet.authenticated) {
    label = shortAddress(wallet.address);
    action = wallet.signOut;
  }

  return (
    <div className="wallet-control">
      <button
        className={`wallet-button${wallet.authenticated ? " is-authenticated" : ""}`}
        type="button"
        onClick={() => void action()}
        disabled={wallet.busy}
        aria-label={
          wallet.authenticated ? `${label}, sign out` : label
        }
      >
        {wallet.authenticated ? <Check size={15} /> : <Wallet size={15} />}
        <span>{wallet.busy ? "Waiting for wallet…" : label}</span>
        {wallet.authenticated && <ChevronDown size={14} />}
      </button>
      {wallet.error && (
        <div className="wallet-error" role="status">
          <AlertCircle size={14} />
          {wallet.error}
        </div>
      )}
    </div>
  );
}
