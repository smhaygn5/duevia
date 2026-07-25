"use client";

import { Bell, Check, Globe2, ShieldCheck, WalletCards } from "lucide-react";
import { useState, type FormEvent } from "react";
import { AppHeader } from "./app-header";
import { useWallet } from "./wallet-provider";

export function SettingsForm() {
  const wallet = useWallet();
  const [workspaceName, setWorkspaceName] = useState("Duevia workspace");
  const [email, setEmail] = useState("");
  const [alerts, setAlerts] = useState("important");
  const [saved, setSaved] = useState(false);

  function save(event: FormEvent) {
    event.preventDefault();
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1_800);
  }

  return (
    <>
      <AppHeader
        eyebrow="Workspace"
        title="Settings"
        description="Control your profile, settlement network, and notification preferences."
      />
      <form className="settings-form" onSubmit={save}>
        <section className="settings-section">
          <div className="settings-copy">
            <span className="settings-icon">
              <Globe2 size={19} />
            </span>
            <div>
              <h2>Workspace profile</h2>
              <p>The name shown across your private agreement workspace.</p>
            </div>
          </div>
          <div className="settings-fields">
            <label className="field">
              <span>Workspace name</span>
              <input
                value={workspaceName}
                onChange={(event) => setWorkspaceName(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Notification email · optional</span>
              <input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <small>Only milestone and settlement alerts are sent.</small>
            </label>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-copy">
            <span className="settings-icon">
              <WalletCards size={19} />
            </span>
            <div>
              <h2>Wallet & settlement</h2>
              <p>Your wallet is your identity; Duevia never holds its key.</p>
            </div>
          </div>
          <div className="settings-fields">
            <div className="settings-readonly">
              <span>Connected wallet</span>
              <strong>
                {wallet.address
                  ? `${wallet.address.slice(0, 8)}…${wallet.address.slice(-6)}`
                  : "Not connected"}
              </strong>
            </div>
            <div className="settings-readonly">
              <span>Settlement asset</span>
              <strong>USDC on Arc Testnet</strong>
            </div>
            <div className="security-note">
              <ShieldCheck size={17} />
              Sign-in proves wallet ownership. It cannot move funds.
            </div>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-copy">
            <span className="settings-icon">
              <Bell size={19} />
            </span>
            <div>
              <h2>Notifications</h2>
              <p>Choose how often Duevia asks for your attention.</p>
            </div>
          </div>
          <fieldset className="settings-fields notification-options">
            <legend className="sr-only">Notification frequency</legend>
            {[
              ["important", "Important actions", "Funding, review, deadline, and release events."],
              ["all", "Every activity", "All agreement and delivery updates."],
              ["none", "Never", "No email notifications."],
            ].map(([value, label, help]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="alerts"
                  value={value}
                  checked={alerts === value}
                  onChange={(event) => setAlerts(event.target.value)}
                />
                <span>
                  <strong>{label}</strong>
                  <small>{help}</small>
                </span>
              </label>
            ))}
          </fieldset>
        </section>

        <div className="settings-actions">
          <span>
            {saved && (
              <>
                <Check size={15} />
                Preferences saved for this preview
              </>
            )}
          </span>
          <button className="button button-primary">Save preferences</button>
        </div>
      </form>
    </>
  );
}
