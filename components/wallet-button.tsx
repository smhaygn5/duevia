"use client";

import {
  AlertCircle,
  Check,
  ChevronDown,
  LogOut,
  RefreshCw,
  Wallet,
  X,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
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
  const [accountOpen, setAccountOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement>(null);
  const wrongNetwork =
    wallet.address !== null &&
    wallet.chainId !== null &&
    wallet.chainId !== ARC.chainId;

  useEffect(() => {
    if (!chooserOpen && !accountOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setChooserOpen(false);
        setAccountOpen(false);
      }
    };
    const closeAccountMenu = (event: MouseEvent) => {
      if (
        accountOpen &&
        controlRef.current &&
        !controlRef.current.contains(event.target as Node)
      ) {
        setAccountOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("mousedown", closeAccountMenu);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("mousedown", closeAccountMenu);
    };
  }, [accountOpen, chooserOpen]);

  let label = "Connect wallet";
  if (wallet.authenticated && !wallet.activeWalletName) {
    label = "Reconnect wallet";
  } else if (wallet.address && wrongNetwork) {
    label = "Switch to Arc";
  } else if (wallet.address && !wallet.authenticated) {
    label = "Sign in";
  } else if (wallet.address && wallet.authenticated) {
    label = shortAddress(wallet.address);
  }

  function openChooser() {
    wallet.clearError();
    setAccountOpen(false);
    setChooserOpen(true);
  }

  async function chooseWallet(walletId: string) {
    const connected = await wallet.connect(walletId);
    if (connected) setChooserOpen(false);
  }

  async function changeWallet() {
    setAccountOpen(false);
    await wallet.signOut();
    setChooserOpen(true);
  }

  async function disconnectWallet() {
    setAccountOpen(false);
    await wallet.signOut();
  }

  return (
    <div className="wallet-control" ref={controlRef}>
      {wallet.address ? (
        <button
          className={`wallet-button wallet-status${
            wallet.authenticated ? " is-authenticated" : ""
          }`}
          type="button"
          onClick={() => {
            wallet.clearError();
            setAccountOpen((current) => !current);
          }}
          disabled={wallet.busy}
          aria-haspopup="menu"
          aria-expanded={accountOpen}
          aria-label={`${wallet.activeWalletName ?? "EVM wallet"}, ${label}`}
        >
          {wallet.authenticated ? <Check size={15} /> : <Wallet size={15} />}
          <span>{wallet.busy ? "Waiting for wallet…" : label}</span>
          <ChevronDown size={14} />
        </button>
      ) : (
        <button
          className="wallet-button"
          type="button"
          onClick={openChooser}
          disabled={wallet.busy}
          aria-label={label}
        >
          <Wallet size={15} />
          <span>{wallet.busy ? "Waiting for wallet…" : label}</span>
        </button>
      )}

      {accountOpen && wallet.address && (
        <div className="wallet-account-menu" role="menu">
          <header>
            <span className="wallet-account-icon">
              {wallet.authenticated ? <Check size={15} /> : <Wallet size={15} />}
            </span>
            <div>
              <strong>{wallet.activeWalletName ?? "Connected EVM wallet"}</strong>
              <small>{shortAddress(wallet.address)}</small>
            </div>
          </header>

          {wrongNetwork && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setAccountOpen(false);
                void wallet.switchToArc().catch(() => {});
              }}
            >
              <RefreshCw size={15} />
              <span>
                <strong>Switch to Arc Testnet</strong>
                <small>Approve the network request in your wallet.</small>
              </span>
            </button>
          )}

          {!wrongNetwork && !wallet.authenticated && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setAccountOpen(false);
                void wallet.signIn();
              }}
            >
              <Check size={15} />
              <span>
                <strong>Sign in to Duevia</strong>
                <small>Free signature only; no transaction or gas.</small>
              </span>
            </button>
          )}

          {wallet.authenticated && !wallet.activeWalletName && (
            <button type="button" role="menuitem" onClick={openChooser}>
              <RefreshCw size={15} />
              <span>
                <strong>Reconnect extension</strong>
                <small>Use the wallet that owns this active session.</small>
              </span>
            </button>
          )}

          <button
            type="button"
            role="menuitem"
            onClick={() => void changeWallet()}
          >
            <RefreshCw size={15} />
            <span>
              <strong>Change wallet</strong>
              <small>The new wallet must sign a fresh Duevia message.</small>
            </span>
          </button>
          <button
            className="danger"
            type="button"
            role="menuitem"
            onClick={() => void disconnectWallet()}
          >
            <LogOut size={15} />
            <span>
              <strong>Disconnect wallet</strong>
              <small>End this session and clear the selected wallet.</small>
            </span>
          </button>
        </div>
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
                <p>
                  Duevia will connect only to the wallet you select. A fresh
                  signature is required for every new wallet session.
                </p>
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
