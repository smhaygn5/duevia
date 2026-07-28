"use client";

import {
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  Info,
  LockKeyhole,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  estimateArcBridge,
  executeArcBridge,
  fundingSources,
  getUnifiedUsdcBalance,
  type BridgeQuote,
  type FundingSource,
  type UnifiedBalance,
} from "@/lib/circle/browser";
import {
  formatArcBridgeError,
  isArcBridgeError,
} from "@/lib/circle/errors";
import { demoAgreement } from "@/lib/demo-data";
import {
  escrowConfigFromAgreement,
  loadAgreement,
  type AgreementPayload,
} from "@/lib/agreements/client";
import {
  approveAgreementUsdc,
  deployAgreementEscrow,
  formatContractError,
  getDueviaFactoryAddress,
  readFundingState,
  recoverAgreementEscrow,
  syncAgreementTransaction,
  writeEscrowAction,
} from "@/lib/contracts/duevia";
import { useWallet } from "./wallet-provider";

export function FundingPanel({ agreementRef }: { agreementRef: string }) {
  const wallet = useWallet();
  const isDemo = agreementRef.toUpperCase() === demoAgreement.publicRef;
  const [agreementData, setAgreementData] = useState<AgreementPayload | null>(null);
  const [source, setSource] = useState<FundingSource>("Arc_Testnet");
  const [method, setMethod] = useState<"bridge" | "unified">("bridge");
  const [quote, setQuote] = useState<BridgeQuote | null>(null);
  const [unifiedBalance, setUnifiedBalance] = useState<UnifiedBalance | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bridgeComplete, setBridgeComplete] = useState(false);
  const [bridgeResumeReady, setBridgeResumeReady] = useState(false);
  const [approved, setApproved] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const agreement = agreementData?.agreement;
  const amount = agreement?.total_amount ?? demoAgreement.total.replace(",", "");
  const escrowAddress = agreement?.contract_address ?? null;
  const factoryAddress = getDueviaFactoryAddress();
  const directArc = source === "Arc_Testnet";
  const selected = fundingSources.find((option) => option.value === source);

  const receiveAmount = useMemo(() => {
    const fee = Number(quote?.protocolFee ?? 0);
    return Math.max(Number(amount) - fee, 0).toLocaleString(undefined, {
      maximumFractionDigits: 6,
    });
  }, [amount, quote]);

  useEffect(() => {
    if (isDemo || !wallet.authenticated) return;
    void loadAgreement(agreementRef)
      .then(async (payload) => {
        setAgreementData(payload);
        if (payload.agreement.contract_address && wallet.address) {
          const funding = await readFundingState(
            wallet.address,
            payload.agreement.contract_address,
            BigInt(payload.agreement.total_amount_minor),
          );
          setApproved(funding.approved);
          setConfirmed(funding.funded);
        }
      })
      .catch((loadError: unknown) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Agreement could not be loaded.",
        ),
      );
  }, [agreementRef, isDemo, wallet.address, wallet.authenticated]);

  async function estimate() {
    setError(null);
    setQuote(null);
    if (!wallet.address) {
      setError("Connect a wallet before preparing the funding route.");
      return;
    }
    if (method === "unified") {
      setBusy(true);
      try {
        setUnifiedBalance(await getUnifiedUsdcBalance(wallet.address));
        setQuote({
          amount,
          protocolFee: "Calculated at spend",
          gasSummary: "USDC",
          source: "Unified Balance",
          destination: "Arc_Testnet",
        });
      } catch (balanceError) {
        setError(
          balanceError instanceof Error
            ? balanceError.message
            : "The unified balance could not be loaded.",
        );
      } finally {
        setBusy(false);
      }
      return;
    }
    if (directArc) {
      setQuote({
        amount,
        protocolFee: "0",
        gasSummary: "USDC",
        source: "Arc_Testnet",
        destination: "Arc_Testnet",
      });
      return;
    }
    setBusy(true);
    try {
      setQuote(await estimateArcBridge(source, amount));
    } catch (quoteError) {
      setError(
        quoteError instanceof Error
          ? quoteError.message
          : "The route could not be estimated.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function continueFunding() {
    setError(null);
    if (isDemo) {
      setProgress("Demo route prepared. No transaction was broadcast.");
      return;
    }
    if (!wallet.address || !wallet.authenticated) {
      setError("Connect and sign in with the client wallet first.");
      return;
    }
    if (!agreementData) {
      setError("The accepted agreement is still loading.");
      return;
    }
    if (agreementData.agreement.current_role !== "client") {
      setError("Only the client wallet can deploy and fund this escrow.");
      return;
    }

    setBusy(true);
    let fundingStage:
      | "bridge"
      | "recovery"
      | "network"
      | "deployment"
      | "approval"
      | "funding" = "recovery";
    try {
      if (method === "bridge" && !directArc && !bridgeComplete) {
        fundingStage = "bridge";
        setProgress(
          bridgeResumeReady
            ? "Resuming the existing Circle route without starting over."
            : "Circle is moving USDC to Arc. Confirm each wallet step.",
        );
        await executeArcBridge(source, amount, wallet.address);
        setBridgeComplete(true);
        setBridgeResumeReady(false);
        setProgress("USDC arrived on Arc. Continue to deploy the escrow.");
        return;
      }
      if (method === "unified" && !directArc) {
        setError(
          "Unified Balance is shown for discovery. Choose Bridge or Arc Testnet to execute funding.",
        );
        return;
      }

      fundingStage = "recovery";
      const storedEscrow = agreementData.agreement.contract_address;
      let activeEscrow = await recoverAgreementEscrow(agreementRef);
      if (
        activeEscrow &&
        activeEscrow.toLowerCase() !== storedEscrow?.toLowerCase()
      ) {
        setAgreementData((current) =>
          current
            ? {
                ...current,
                agreement: {
                  ...current.agreement,
                  contract_address: activeEscrow,
                },
              }
            : current,
        );
        setProgress(
          storedEscrow
            ? "The verified Arc escrow replaced a stale local address. Continue to approve the USDC amount."
            : "Existing escrow recovered from Arc. Continue to approve the USDC amount.",
        );
        return;
      }
      if (!activeEscrow) {
        if (!factoryAddress) {
          throw new Error("Duevia's Arc testnet factory is not configured yet.");
        }
      }

      fundingStage = "network";
      await wallet.switchToArc();
      if (!activeEscrow) {
        fundingStage = "deployment";
        setProgress("Deploying an isolated escrow for this agreement.");
        const receipt = await deployAgreementEscrow(
          wallet.address,
          escrowConfigFromAgreement(agreementData),
        );
        const sync = await syncAgreementTransaction(agreementRef, receipt);
        if (!sync.contractAddress) {
          throw new Error("The new escrow address was not returned.");
        }
        activeEscrow = sync.contractAddress;
        setAgreementData((current) =>
          current
            ? {
                ...current,
                agreement: {
                  ...current.agreement,
                  contract_address: activeEscrow,
                },
              }
            : current,
        );
        setProgress("Escrow deployed. Continue to approve the USDC amount.");
        return;
      }

      if (!approved) {
        fundingStage = "approval";
        setProgress("Approving only this agreement's USDC amount.");
        await approveAgreementUsdc(
          wallet.address,
          activeEscrow,
          BigInt(agreementData.agreement.total_amount_minor),
        );
        setApproved(true);
        setProgress("USDC approved. Continue once more to lock the funds.");
        return;
      }

      fundingStage = "funding";
      setProgress("Locking the agreement total in escrow.");
      const receipt = await writeEscrowAction(wallet.address, activeEscrow, {
        name: "fund",
        args: [],
      });
      await syncAgreementTransaction(agreementRef, receipt);
      setConfirmed(true);
      setProgress("Funding confirmed on Arc. The provider can now begin.");
    } catch (fundingError) {
      setProgress(null);
      if (fundingStage === "bridge") {
        setBridgeResumeReady(
          isArcBridgeError(fundingError) && fundingError.canResume,
        );
        setError(
          formatArcBridgeError(
            fundingError,
            selected?.label ?? "the source network",
          ),
        );
      } else {
        const fallback =
          fundingStage === "recovery"
            ? "The agreement escrow could not be verified against Arc. Reload the agreement before continuing."
            : fundingStage === "network"
              ? "Switch the connected client wallet to Arc Testnet and try again."
              : fundingStage === "deployment"
                ? "The agreement escrow could not be deployed. Check the connected client wallet and try again."
                : fundingStage === "approval"
                  ? `The USDC approval did not complete. The Arc client wallet needs at least ${amount} USDC plus the network fee.`
                  : "The escrow could not lock the funds. Confirm that the connected wallet is the agreement client and that the USDC approval succeeded.";
        setError(formatContractError(fundingError, fallback));
      }
    } finally {
      setBusy(false);
    }
  }

  const actionLabel = confirmed
    ? "Funding confirmed"
    : isDemo
      ? "Prepare demo route"
      : method === "bridge" && !directArc && !bridgeComplete
        ? bridgeResumeReady
          ? "Resume USDC bridge"
          : "Bridge USDC to Arc"
        : !escrowAddress
          ? "Deploy agreement escrow"
          : !approved
            ? "Approve agreement amount"
            : "Fund escrow";

  return (
    <>
      <Link
        className="page-back"
        href={`/app/agreements/${agreementRef.toLowerCase()}`}
      >
        <ArrowLeft size={15} />
        Back to agreement
      </Link>
      <section className="funding-layout">
        <div className="funding-context">
          <p className="eyebrow">Fund agreement</p>
          <h1>Bring USDC to Arc, then lock it once.</h1>
          <p>
            Duevia keeps crosschain preparation separate from escrow funding.
            You always see which transaction is moving funds and which one is
            locking the agreement.
          </p>

          <div className="funding-agreement-card">
            <div>
              <small>Agreement</small>
              <strong>{agreement?.title ?? demoAgreement.title}</strong>
              <span>{agreementRef.toUpperCase()}</span>
            </div>
            <div>
              <small>Total funding</small>
              <strong>{Number(amount).toLocaleString()} USDC</strong>
              <span>
                {agreementData?.milestones.length ?? demoAgreement.milestones.length} milestones
              </span>
            </div>
          </div>

          <ol className="funding-steps">
            <li className={quote ? "complete" : "active"}>
              <span>{quote ? <Check size={14} /> : "1"}</span>
              <div>
                <strong>Prepare funds on Arc</strong>
                <p>Estimate a Circle App Kit route or use an Arc balance.</p>
              </div>
            </li>
            <li className={quote ? "active" : ""}>
              <span>2</span>
              <div>
                <strong>Fund the escrow</strong>
                <p>One explicit transaction locks the agreement total.</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Wait for confirmation</strong>
                <p>The provider can start only after Arc confirms funding.</p>
              </div>
            </li>
          </ol>
        </div>

        <aside className="funding-widget">
          <header>
            <div>
              <span className="action-icon small">
                <LockKeyhole size={18} />
              </span>
              <div>
                <strong>Funding route</strong>
                <small>Circle App Kit · USDC only</small>
              </div>
            </div>
            <span className="network-chip">
              <i />
              Testnet
            </span>
          </header>

          <div className="funding-method-tabs" role="group" aria-label="Funding method">
            <button
              type="button"
              className={method === "bridge" ? "active" : ""}
              aria-pressed={method === "bridge"}
              onClick={() => {
                setMethod("bridge");
                setQuote(null);
                setUnifiedBalance(null);
                setBridgeComplete(false);
                setBridgeResumeReady(false);
              }}
            >
              Arc / Bridge
            </button>
            <button
              type="button"
              className={method === "unified" ? "active" : ""}
              aria-pressed={method === "unified"}
              onClick={() => {
                setMethod("unified");
                setQuote(null);
                setBridgeComplete(false);
                setBridgeResumeReady(false);
              }}
            >
              Unified Balance
            </button>
          </div>

          <div className="funding-amount-box">
            <div>
              <span>You fund</span>
              <strong>{Number(amount).toLocaleString()}</strong>
              <small>≈ {Number(amount).toLocaleString()} USDC</small>
            </div>
            {method === "bridge" ? (
              <label>
                <span className="sr-only">Source network</span>
                <select
                  value={source}
                  onChange={(event) => {
                    setSource(event.target.value as FundingSource);
                    setQuote(null);
                    setBridgeComplete(false);
                    setBridgeResumeReady(false);
                  }}
                >
                  {fundingSources.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="unified-chip">Gateway</span>
            )}
          </div>

          <div className="funding-swap-divider">
            <span>
              <ArrowDownUp size={16} />
            </span>
          </div>

          <div className="funding-amount-box receive">
            <div>
              <span>Escrow receives</span>
              <strong>{receiveAmount}</strong>
              <small>USDC on Arc Testnet</small>
            </div>
            <div className="arc-token">A</div>
          </div>

          <div className="route-details">
            <div>
              <span>Route</span>
              <strong>
                {method === "unified"
                  ? "Unified Balance → Arc Testnet"
                  : `${selected?.label} → Arc Testnet`}
              </strong>
            </div>
            {method === "unified" && (
              <div>
                <span>Available balance</span>
                <strong>
                  {unifiedBalance
                    ? `${unifiedBalance.total} USDC · ${unifiedBalance.chains} chains`
                    : "Check first"}
                </strong>
              </div>
            )}
            <div>
              <span>Protocol fee</span>
              <strong>{quote ? `${quote.protocolFee} USDC` : "Estimate first"}</strong>
            </div>
            <div>
              <span>Gas</span>
              <strong>{quote?.gasSummary ?? "Paid on source"}</strong>
            </div>
            <div>
              <span>ETA</span>
              <strong>
                <Clock3 size={13} /> Route dependent
              </strong>
            </div>
          </div>

          {error && <div className="form-error" role="alert">{error}</div>}
          {!quote ? (
            <button
              className="button button-primary funding-button"
              type="button"
              onClick={() => void estimate()}
              disabled={busy}
            >
              {busy ? "Estimating with App Kit…" : "Estimate funding route"}
              {!busy && <ArrowRight size={16} />}
            </button>
          ) : (
            <button
              className="button button-primary funding-button"
              type="button"
              disabled={busy || confirmed}
              onClick={() => void continueFunding()}
            >
              {busy ? "Waiting for wallet confirmation..." : actionLabel}
            </button>
          )}

          {progress && <div className="demo-disclosure">{progress}</div>}
          {!isDemo && !factoryAddress && (
            <p className="widget-note">
              <Info size={14} />
              Route preparation is live. Escrow execution activates when the
              Duevia factory address is published.
            </p>
          )}
        </aside>
      </section>
    </>
  );
}
