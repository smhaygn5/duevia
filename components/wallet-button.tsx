"use client";

import {
  AlertCircle,
  Check,
  ChevronDown,
  Wallet,
  X,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { ARC } from "@/lib/arc/config";
import { useWallet } from "./wallet-provider";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function walletInitial(name: string) {
  return name.trim().slice(0, 1).toUpperCase();
}

export function WalletButton() {
  const wallet = useWallet();
  const [chooserOpen, setChooserOpen] = useState(false);
  const wrongNetwork =
    wallet.address !== null &&
    wallet.chainId !== null &&
    wallet.chainId !== ARC.chainId;

  useEffect(() => {
    if (!chooserOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setChooserOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [chooserOpen]);

  let label = "Connect wallet";
  let action: (() => Promise<unknown>) | null = null;
  if (wallet.authenticated && !wallet.activeWalletName) {
    label = "Reconnect wallet";
  } else if (wallet.address && wrongNetwork) {
    label = "Switch to Arc";
    action = wallet.switchToArc;
  } else if (wallet.address && !wallet.authenticated) {
    label = "Sign in";
    action = wallet.signIn;
  } else if (wallet.address && wallet.authenticated) {
    label = shortAddress(wallet.address);
  }
  const showIdentity =
    wallet.authenticated && Boolean(wallet.activeWalletName) && !wrongNetwork;

  function openChooser() {
    wallet.clearError();
    setChooserOpen(true);
  }

  async function chooseWallet(walletId: string) {
    const connected = await wallet.connect(walletId);
    if (connected) setChooserOpen(false);
  }

  return (
    <div className="wallet-control">
      {showIdentity ? (
        <div
          className="wallet-button wallet-status is-authenticated"
          aria-label={`${wallet.activeWalletName}, ${label}, connected`}
        >
          <Check size={15} />
          <span>{label}</span>
        </div>
      ) : (
        <button
          className={`wallet-button${wallet.authenticated ? " is-authenticated" : ""}`}
          type="button"
          onClick={() => {
            if (action) void action();
            else openChooser();
          }}
          disabled={wallet.busy}
          aria-label={label}
        >
          {wallet.authenticated ? <Check size={15} /> : <Wallet size={15} />}
          <span>{wallet.busy ? "Waiting for wallet…" : label}</span>
        </button>
      )}

      {wallet.error && (
        <div className="wallet-error" role="status">
          <AlertCircle size={14} />
          {wallet.error}
        </div>
      )}

      {chooserOpen && (
        <div
          className="wallet-picker-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setChooserOpen(false);
          }}
        >
          <section
            className="wallet-picker"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wallet-picker-title"
          >
            <header>
              <div>
                <span>Installed EVM wallets</span>
                <h2 id="wallet-picker-title">Choose a wallet</h2>
                <p>Duevia will connect only to the wallet you select.</p>
              </div>
              <button
                type="button"
                className="wallet-picker-close"
                onClick={() => setChooserOpen(false)}
                aria-label="Close wallet selection"
              >
                <X size={18} />
              </button>
            </header>

            <div className="wallet-picker-list">
              {wallet.installedWallets.map((installedWallet, index) => (
                <button
                  type="button"
                  key={installedWallet.id}
                  onClick={() => void chooseWallet(installedWallet.id)}
                  disabled={wallet.busy}
                  autoFocus={index === 0}
                >
                  <span
                    className={`wallet-picker-mark${
                      installedWallet.icon ? " has-icon" : ""
                    }`}
                  >
                    {installedWallet.icon ? (
                      <Image
                        src={installedWallet.icon}
                        alt=""
                        width={38}
                        height={38}
                        unoptimized
                      />
                    ) : (
                      walletInitial(installedWallet.name)
                    )}
                  </span>
                  <span>
                    <strong>{installedWallet.name}</strong>
                    <small>Browser extension · detected</small>
                  </span>
                  <ChevronDown size={16} />
                </button>
              ))}
            </div>

            {!wallet.hasProvider && (
              <div className="wallet-picker-empty">
                <AlertCircle size={18} />
                <div>
                  <strong>No installed EVM wallet detected</strong>
                  <p>
                    Install or enable MetaMask, OKX Wallet, or another EVM
                    browser extension, then refresh this page.
                  </p>
                </div>
              </div>
            )}

            <footer>
              Only installed extensions are listed. Coinbase will never open
              automatically.
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
