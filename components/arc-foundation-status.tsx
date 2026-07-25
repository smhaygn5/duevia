import { ARC, ARC_CONTRACTS } from "@/lib/arc/config";

export function ArcFoundationStatus() {
  return (
    <aside className="foundation-status" aria-label="Arc foundation status">
      <header>
        <span>Settlement foundation</span>
        <span className="pill pill-live">Configured</span>
      </header>
      <div className="foundation-status-list">
        <div className="foundation-status-row">
          <div>
            <strong>Arc Testnet</strong>
            <span>Primary settlement network</span>
          </div>
          <code>{ARC.chainId}</code>
        </div>
        <div className="foundation-status-row">
          <div>
            <strong>USDC</strong>
            <span>Escrow and native gas currency</span>
          </div>
          <code>{ARC_CONTRACTS.usdc.slice(0, 8)}…</code>
        </div>
        <div className="foundation-status-row">
          <div>
            <strong>Circle App Kit</strong>
            <span>Bridge and unified balance ready</span>
          </div>
          <code>v1</code>
        </div>
        <div className="foundation-status-row">
          <div>
            <strong>Agreement privacy</strong>
            <span>Hashes onchain, files in protected storage</span>
          </div>
          <code>hybrid</code>
        </div>
      </div>
    </aside>
  );
}
