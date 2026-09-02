"use client";

import {
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  ExternalLink,
  Info,
  LockKeyhole,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { parseUnits, type Hex } from "viem";
import {
  checkArcBridgeReadiness,
  estimateArcBridge,
  estimateUnifiedSpend,
  executeArcBridge,
  executeUnifiedSpend,
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
import { ARC } from "@/lib/arc/config";
import {
  escrowConfigFromAgreement,
  loadAgreement,
  type AgreementPayload,
} from "@/lib/agreements/client";
import { fundingTimelineSteps } from "@/lib/agreements/funding-progress";
import { gatewayArrivalConfirmed } from "@/lib/agreements/gateway-sync";
import {
  approveAgreementUsdc,
  deployAgreementEscrow,
  formatContractError,
  fundingBalanceError,
  getDueviaFactoryAddress,
  readArcFundingBalances,
  readFundingState,
  recoverFundingState,
  recoverAgreementEscrow,
  syncAgreementTransaction,
  writeEscrowAction,
} from "@/lib/contracts/duevia";
import { useWallet } from "./wallet-provider";

type ReadinessItem = {
  id: "wallet" | "network" | "usdc" | "gas";
  label: string;
  detail: string;
  status: "ready" | "attention";
};

type StoredGatewaySync = {
  agreementRef: string;
  address: string;
  amountMinor: string;
  arcBalanceBefore: string;
  startedAt: number;
};

const gatewaySyncStorageKey = "duevia:gateway-arrival-sync:v1";

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
  const [fundingSubmitted, setFundingSubmitted] = useState(false);
  const [routeInFlight, setRouteInFlight] = useState(false);
  const [escrowInFlight, setEscrowInFlight] = useState(false);
  const [timelineTransactions, setTimelineTransactions] = useState<
    Partial<Record<"route" | "arrival" | "escrow", { hash: Hex; href: string; label: string }>>
  >({});
  const [readiness, setReadiness] = useState<ReadinessItem[] | null>(null);
  const [readinessChecking, setReadinessChecking] = useState(false);
  const [gatewaySync, setGatewaySync] = useState<
    "idle" | "checking" | "confirmed" | "waiting"
  >("idle");
  const gatewaySyncStarted = useRef(false);
  const [progress, setProgress] = useState<string | null>(null);
  const agreement = agreementData?.agreement;
  const amount = agreement?.total_amount ?? demoAgreement.total.replace(",", "");
  const escrowAddress = agreement?.contract_address ?? null;
  const factoryAddress = getDueviaFactoryAddress();
  const directArc = source === "Arc_Testnet";
  const selected = fundingSources.find((option) => option.value === source);

  const receiveAmount = useMemo(() => {
    const exactAmount = quote?.amount ?? amount;
    return Number(exactAmount).toLocaleString(undefined, {
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

  function readStoredGatewaySync() {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.sessionStorage.getItem(gatewaySyncStorageKey);
      if (!raw) return null;
      const stored = JSON.parse(raw) as StoredGatewaySync;
      if (
        stored.agreementRef !== agreementRef ||
        stored.address.toLowerCase() !== wallet.address?.toLowerCase() ||
        Date.now() - stored.startedAt > 10 * 60 * 1000
      ) {
        window.sessionStorage.removeItem(gatewaySyncStorageKey);
        return null;
      }
      return stored;
    } catch {
      return null;
    }
  }

  function clearStoredGatewaySync() {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.removeItem(gatewaySyncStorageKey);
    } catch {
      // The in-memory state still prevents a duplicate funding attempt.
    }
  }

  async function monitorGatewayArrival(
    stored: StoredGatewaySync,
    attempts = 12,
  ) {
    if (!wallet.address || gatewaySyncStarted.current) return;
    gatewaySyncStarted.current = true;
    setGatewaySync("checking");
    try {
      const amountMinor = BigInt(stored.amountMinor);
      const before = BigInt(stored.arcBalanceBefore);
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const balances = await readArcFundingBalances(wallet.address);
        if (
          gatewayArrivalConfirmed({
            arcBalanceBefore: before,
            arcBalanceNow: balances.usdc,
            amount: amountMinor,
          })
        ) {
          setGatewaySync("confirmed");
          setBridgeComplete(true);
          clearStoredGatewaySync();
          setProgress("Gateway sync confirmed the USDC arrival on Arc. Continue to deploy or fund the escrow.");
          return;
        }
        if (attempt < attempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, 2_000));
        }
      }
      setGatewaySync("waiting");
      setProgress("Gateway transfer is still being indexed on Arc. Check the arrival again before funding.");
    } catch {
      setGatewaySync("waiting");
      setProgress("Gateway arrival could not be confirmed yet. Check the Arc balance again before funding.");
    } finally {
      gatewaySyncStarted.current = false;
    }
  }

  function resumeGatewayArrivalCheck() {
    const stored = readStoredGatewaySync();
    if (stored) {
      void monitorGatewayArrival(stored, 6);
      return;
    }
    setError("The Gateway arrival session has expired. Reload the agreement and confirm the Arc balance before continuing.");
  }

  useEffect(() => {
    if (method !== "unified" || !wallet.address || gatewaySyncStarted.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      const stored = readStoredGatewaySync();
      if (stored) void monitorGatewayArrival(stored);
    }, 0);
    return () => window.clearTimeout(timer);
    // The functions intentionally read the latest wallet and agreement values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, wallet.address]);

  async function estimate() {
    setError(null);
    setQuote(null);
    setReadiness(null);
    if (!wallet.address) {
      setError("Connect a wallet before preparing the funding route.");
      return;
    }
    if (method === "unified") {
      setBusy(true);
      try {
        const balance = await getUnifiedUsdcBalance(wallet.address);
        setUnifiedBalance(balance);
        if (Number(balance.total) < Number(amount)) {
          throw new Error(
            `Circle Gateway has ${balance.total} USDC available, but this agreement needs ${amount} USDC. Use Arc / Bridge for regular wallet USDC, or deposit more USDC into Gateway first.`,
          );
        }
        const provider = await wallet.ensureProvider();
        setQuote(await estimateUnifiedSpend(amount, provider));
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
        fees: [
          {
            label: "Arc network fee",
            amount: "Shown in wallet",
            detail: "Paid from the same Arc USDC balance",
          },
        ],
        source: "Arc_Testnet",
        destination: "Arc_Testnet",
      });
      return;
    }
    setBusy(true);
    try {
      const provider = await wallet.ensureProvider();
      setQuote(await estimateArcBridge(source, amount, provider));
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

  async function runReadinessCheck() {
    setError(null);
    if (isDemo) {
      setReadiness([
        { id: "wallet", label: "Client wallet", detail: "Demo wallet ready.", status: "ready" },
        { id: "network", label: "Arc route", detail: "Demo route is configured for Arc Testnet.", status: "ready" },
        { id: "usdc", label: "USDC amount", detail: `Demo balance covers ${amount} USDC.`, status: "ready" },
        { id: "gas", label: "Network fee buffer", detail: "No transaction is broadcast in demo mode.", status: "ready" },
      ]);
      return;
    }
    if (!wallet.address || !wallet.authenticated) {
      setReadiness([
        { id: "wallet", label: "Client wallet", detail: "Connect and sign in with the agreement client wallet.", status: "attention" },
        { id: "network", label: "Route", detail: "A connected wallet is required before the route can be checked.", status: "attention" },
        { id: "usdc", label: "USDC amount", detail: "Balance has not been checked yet.", status: "attention" },
        { id: "gas", label: "Network fee buffer", detail: "Balance has not been checked yet.", status: "attention" },
      ]);
      return;
    }

    setReadinessChecking(true);
    try {
      const provider = await wallet.ensureProvider();
      const items: ReadinessItem[] = [
        {
          id: "wallet",
          label: "Client wallet",
          detail: "Connected and authenticated for this agreement.",
          status: "ready",
        },
      ];

      if (method === "unified") {
        const balance = await getUnifiedUsdcBalance(wallet.address);
        setUnifiedBalance(balance);
        const sufficient = Number(balance.total) >= Number(amount);
        items.push(
          {
            id: "network",
            label: "Arc destination",
            detail: "Circle Gateway will mint the unified balance on Arc Testnet.",
            status: "ready",
          },
          {
            id: "usdc",
            label: "Unified USDC balance",
            detail: `${balance.total} USDC available across ${balance.chains} funded chain${balance.chains === 1 ? "" : "s"}.`,
            status: sufficient ? "ready" : "attention",
          },
          {
            id: "gas",
            label: "Route estimate",
            detail: quote ? "Circle Gateway route estimate is ready." : "Estimate the Gateway route first.",
            status: quote ? "ready" : "attention",
          },
        );
      } else if (directArc) {
        const [balances, rawChainId] = await Promise.all([
          readArcFundingBalances(wallet.address),
          provider.request<string>({ method: "eth_chainId" }),
        ]);
        const required = agreement
          ? BigInt(agreement.total_amount_minor)
          : parseUnits(amount, 6);
        const balanceIssue = fundingBalanceError(balances, required);
        const onArc = Number.parseInt(rawChainId, 16) === ARC.chainId;
        items.push(
          {
            id: "network",
            label: "Arc Testnet",
            detail: onArc ? "The connected wallet is already on Arc Testnet." : "Switch the wallet to Arc Testnet before funding.",
            status: onArc ? "ready" : "attention",
          },
          {
            id: "usdc",
            label: "Escrow amount",
            detail: `${Number(amount).toLocaleString()} USDC is required; the wallet has ${(Number(balances.usdc) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC on Arc.`,
            status: balances.usdc >= required ? "ready" : "attention",
          },
          {
            id: "gas",
            label: "Arc network fee buffer",
            detail: balanceIssue ?? "A USDC buffer remains after the agreement total for Arc network fees.",
            status: balanceIssue ? "attention" : "ready",
          },
        );
      } else {
        const sourceCheck = await checkArcBridgeReadiness(
          source,
          amount,
          wallet.address,
          provider,
        );
        items.push(
          {
            id: "network",
            label: "Selected source route",
            detail: `${sourceCheck.source} will be switched in the wallet when the Circle route starts.`,
            status: quote ? "ready" : "attention",
          },
          {
            id: "usdc",
            label: "Source USDC",
            detail: `${sourceCheck.usdc} USDC available on ${sourceCheck.source}; ${amount} USDC required.`,
            status: sourceCheck.usdcSufficient ? "ready" : "attention",
          },
          {
            id: "gas",
            label: "Source network fee",
            detail: sourceCheck.gasAvailable
              ? `${sourceCheck.native} ${selected?.walletChain.nativeCurrency.symbol} available for the source transaction.`
              : `Add ${selected?.walletChain.nativeCurrency.symbol} on ${sourceCheck.source} before bridging.`,
            status: sourceCheck.gasAvailable ? "ready" : "attention",
          },
        );
      }
      setReadiness(items);
    } catch (readinessError) {
      setError(
        readinessError instanceof Error
          ? readinessError.message
          : "Funding readiness could not be checked.",
      );
    } finally {
      setReadinessChecking(false);
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
    setEscrowInFlight(false);
    let fundingStage:
      | "bridge"
      | "recovery"
      | "network"
      | "deployment"
      | "approval"
      | "funding" = "recovery";
    let activeEscrowForRecovery = agreementData.agreement.contract_address;
    let submittedHash: Hex | null = null;
    try {
      if (method === "unified" && !bridgeComplete) {
        fundingStage = "bridge";
        setRouteInFlight(true);
        setProgress(
          bridgeResumeReady
            ? "Resuming the committed Gateway transfer without spending twice."
            : "Circle Gateway is minting unified USDC on Arc. Confirm each wallet step.",
        );
        const provider = await wallet.ensureProvider();
        const arcBalanceBefore = await readArcFundingBalances(wallet.address);
        const result = await executeUnifiedSpend(amount, wallet.address, provider);
        if (result.txHash?.startsWith("0x")) {
          setTimelineTransactions((current) => ({
            ...current,
            arrival: {
              hash: result.txHash as Hex,
              href: `${ARC.explorerUrl}/tx/${result.txHash}`,
              label: "View Arc mint",
            },
          }));
        }
        const gatewayArrival: StoredGatewaySync = {
          agreementRef,
          address: wallet.address,
          amountMinor: agreementData.agreement.total_amount_minor,
          arcBalanceBefore: arcBalanceBefore.usdc.toString(),
          startedAt: Date.now(),
        };
        try {
          window.sessionStorage.setItem(
            gatewaySyncStorageKey,
            JSON.stringify(gatewayArrival),
          );
        } catch {
          // The current page can still verify the transfer in memory.
        }
        void monitorGatewayArrival(gatewayArrival);
        setBridgeResumeReady(false);
        setProgress(
          "Gateway transfer is complete. Verifying the Arc USDC arrival now.",
        );
        return;
      }
      if (method === "bridge" && !directArc && !bridgeComplete) {
        fundingStage = "bridge";
        setRouteInFlight(true);
        setProgress(
          bridgeResumeReady
            ? "Resuming the existing Circle route without starting over."
            : "Circle is moving USDC to Arc. Confirm each wallet step.",
        );
        const provider = await wallet.ensureProvider();
        const result = await executeArcBridge(source, amount, wallet.address, provider);
        if (result.sourceTxHash?.startsWith("0x")) {
          const sourceExplorer = selected?.walletChain.blockExplorers?.default.url;
          if (sourceExplorer) {
            setTimelineTransactions((current) => ({
              ...current,
              route: {
                hash: result.sourceTxHash as Hex,
                href: `${sourceExplorer}/tx/${result.sourceTxHash}`,
                label: "View source transaction",
              },
            }));
          }
        }
        if (result.destinationTxHash?.startsWith("0x")) {
          setTimelineTransactions((current) => ({
            ...current,
            arrival: {
              hash: result.destinationTxHash as Hex,
              href: `${ARC.explorerUrl}/tx/${result.destinationTxHash}`,
              label: "View Arc mint",
            },
          }));
        }
        setBridgeComplete(true);
        setBridgeResumeReady(false);
        setProgress("USDC arrived on Arc. Continue to deploy the escrow.");
        return;
      }
      const storedEscrow = agreementData.agreement.contract_address;
      let activeEscrow = storedEscrow;
      if (!activeEscrow) {
        fundingStage = "recovery";
        activeEscrow = await recoverAgreementEscrow(agreementRef);
      }
      if (activeEscrow && !storedEscrow) {
        activeEscrowForRecovery = activeEscrow;
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
        setProgress("Existing escrow recovered from Arc. Continue to approve the USDC amount.");
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
        setEscrowInFlight(true);
        setProgress("Deploying an isolated escrow for this agreement.");
        const receipt = await deployAgreementEscrow(
          wallet.address,
          escrowConfigFromAgreement(agreementData),
        );
        setTimelineTransactions((current) => ({
          ...current,
          escrow: {
            hash: receipt.transactionHash,
            href: `${ARC.explorerUrl}/tx/${receipt.transactionHash}`,
            label: "View escrow deployment",
          },
        }));
        const sync = await syncAgreementTransaction(agreementRef, receipt);
        if (!sync.contractAddress) {
          throw new Error("The new escrow address was not returned.");
        }
        activeEscrow = sync.contractAddress;
        activeEscrowForRecovery = activeEscrow;
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
        setEscrowInFlight(true);
        const requiredAmount = BigInt(
          agreementData.agreement.total_amount_minor,
        );
        const balanceIssue = fundingBalanceError(
          await readArcFundingBalances(wallet.address),
          requiredAmount,
        );
        if (balanceIssue) {
          throw new Error(`DUEVIA_FUNDING_CHECK:${balanceIssue}`);
        }
        setProgress("Approving only this agreement's USDC amount.");
        await approveAgreementUsdc(
          wallet.address,
          activeEscrow,
          requiredAmount,
          (hash) => {
            submittedHash = hash;
            setTimelineTransactions((current) => ({
              ...current,
              escrow: {
                hash,
                href: `${ARC.explorerUrl}/tx/${hash}`,
                label: "View USDC approval",
              },
            }));
            setProgress(
              "USDC approval submitted to Arc. Waiting for confirmation.",
            );
          },
        );
        setApproved(true);
        setProgress("USDC approved. Continue once more to lock the funds.");
        return;
      }

      fundingStage = "funding";
      setEscrowInFlight(true);
      setFundingSubmitted(false);
      setProgress("Locking the agreement total in escrow.");
      const receipt = await writeEscrowAction(
        wallet.address,
        activeEscrow,
        {
          name: "fund",
          args: [],
        },
          (hash) => {
            submittedHash = hash;
            setTimelineTransactions((current) => ({
              ...current,
              escrow: {
                hash,
                href: `${ARC.explorerUrl}/tx/${hash}`,
                label: "View funding transaction",
              },
            }));
          setFundingSubmitted(true);
          setProgress("Funding submitted to Arc. Waiting for confirmation.");
        },
      );
      await syncAgreementTransaction(agreementRef, receipt);
      setConfirmed(true);
      setProgress("Funding confirmed on Arc. The provider can now begin.");
    } catch (fundingError) {
      setFundingSubmitted(false);
      setProgress(null);
      if (fundingStage === "bridge") {
        setBridgeResumeReady(
          isArcBridgeError(fundingError) && fundingError.canResume,
        );
        setError(
          formatArcBridgeError(
            fundingError,
            method === "unified"
              ? "Circle Gateway"
              : selected?.label ?? "the source network",
          ),
        );
      } else {
        const walletMessage =
          fundingError instanceof Error ? fundingError.message : "";
        if (walletMessage.startsWith("DUEVIA_FUNDING_CHECK:")) {
          setError(walletMessage.slice("DUEVIA_FUNDING_CHECK:".length));
          return;
        }
        if (
          activeEscrowForRecovery &&
          submittedHash &&
          (fundingStage === "approval" || fundingStage === "funding")
        ) {
          const recovered = await recoverFundingState(
            wallet.address,
            activeEscrowForRecovery,
            BigInt(agreementData.agreement.total_amount_minor),
            fundingStage === "approval" ? "approved" : "funded",
          );
          if (recovered && fundingStage === "approval") {
            setApproved(true);
            setProgress(
              "USDC approval is confirmed on Arc. Continue once more to lock the funds.",
            );
            return;
          }
          if (recovered?.funded) {
            setConfirmed(true);
            setProgress("Funding is confirmed on Arc. Updating the agreement.");
            try {
              await syncAgreementTransaction(agreementRef, submittedHash);
              setProgress(
                "Funding confirmed on Arc. The provider can now begin.",
              );
            } catch {
              setError(
                "Funding is safe and confirmed on Arc, but the agreement timeline has not updated yet. Reload the agreement in a moment.",
              );
            }
            return;
          }
        }
        if (
          fundingStage === "network" &&
          /unlock|reconnect wallet|connect the agreement client/i.test(
            walletMessage,
          )
        ) {
          setError(walletMessage);
          return;
        }
        const fallback =
          fundingStage === "recovery"
            ? "The agreement escrow could not be verified against Arc. Reload the agreement before continuing."
            : fundingStage === "network"
              ? "Switch the connected client wallet to Arc Testnet and try again."
              : fundingStage === "deployment"
                ? "The agreement escrow could not be deployed. Check the connected client wallet and try again."
                : fundingStage === "approval"
                  ? "The USDC approval was not confirmed. Keep the agreement amount plus a small Arc network-fee buffer in the connected wallet."
                  : "The escrow could not lock the funds. Confirm that the connected wallet is the agreement client and that the USDC approval succeeded.";
        setError(formatContractError(fundingError, fallback));
      }
    } finally {
      setBusy(false);
      setRouteInFlight(false);
      setEscrowInFlight(false);
    }
  }

  const actionLabel = confirmed
    ? "Funding confirmed"
    : isDemo
      ? "Prepare demo route"
      : method === "unified" && gatewaySync === "checking"
        ? "Confirming USDC arrival..."
        : method === "unified" && gatewaySync === "waiting"
          ? "Check USDC arrival"
      : method === "unified" && !bridgeComplete
        ? bridgeResumeReady
          ? "Resume Unified Balance"
          : "Move unified USDC to Arc"
        : method === "bridge" && !directArc && !bridgeComplete
        ? bridgeResumeReady
          ? "Resume USDC bridge"
          : "Bridge USDC to Arc"
        : !escrowAddress
          ? "Deploy agreement escrow"
          : !approved
            ? "Approve agreement amount"
            : "Fund escrow";
  const readinessPassed = Boolean(
    readiness && readiness.every((item) => item.status === "ready"),
  );
  const timelineSteps = fundingTimelineSteps({
    walletConfirmed: Boolean(wallet.authenticated && wallet.address),
    route: method === "unified" ? "gateway" : directArc ? "direct" : "bridge",
    routePrepared: Boolean(quote),
    routeInFlight,
    routeComplete:
      (method === "unified"
        ? gatewaySync === "confirmed"
        : bridgeComplete) ||
      confirmed ||
      approved,
    escrowInFlight: escrowInFlight || fundingSubmitted,
    escrowFunded: confirmed,
  });

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

          <section className="live-funding-timeline" aria-label="Live funding timeline">
            <div className="timeline-heading">
              <span>Live funding timeline</span>
              <small>{confirmed ? "Settlement verified" : "Updates as transactions confirm"}</small>
            </div>
            <ol className="funding-steps">
              {timelineSteps.map((step, index) => {
                const transaction = timelineTransactions[step.id as "route" | "arrival" | "escrow"];
                return (
                  <li className={step.status} key={step.id}>
                    <span>{step.status === "complete" ? <Check size={14} /> : index + 1}</span>
                    <div>
                      <strong>{step.title}</strong>
                      <p>{step.detail}</p>
                      {step.id === "wallet" && wallet.address && step.status === "complete" && (
                        <a href={`${ARC.explorerUrl}/address/${wallet.address}`} target="_blank" rel="noreferrer">
                          View connected wallet <ExternalLink size={11} />
                        </a>
                      )}
                      {transaction && (
                        <a href={transaction.href} target="_blank" rel="noreferrer">
                          {transaction.label} <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
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

          <div className="testnet-disclosure" role="note">
            <Info size={14} />
            <span>
              Testnet only. Use testnet USDC and never send production funds to
              this agreement or its escrow address.
            </span>
          </div>

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
                setReadiness(null);
                setGatewaySync("idle");
                clearStoredGatewaySync();
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
                setUnifiedBalance(null);
                setBridgeComplete(false);
                setBridgeResumeReady(false);
                setReadiness(null);
                setGatewaySync("idle");
                clearStoredGatewaySync();
              }}
            >
              Gateway balance
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
                    setReadiness(null);
                    setGatewaySync("idle");
                    clearStoredGatewaySync();
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
              <span className="unified-chip">Circle Gateway</span>
            )}
          </div>

          <div className="funding-swap-divider">
            <span>
              <ArrowDownUp size={16} />
            </span>
          </div>

          <div className="funding-amount-box receive">
            <div>
              <span>
                {method === "bridge" && directArc
                  ? "Escrow will lock"
                  : "Arrives on Arc"}
              </span>
              <strong>{receiveAmount}</strong>
              <small>
                {method === "bridge" && directArc
                  ? "USDC from the connected Arc wallet"
                  : "USDC available for the escrow"}
              </small>
            </div>
            <div className="arc-token">A</div>
          </div>

          <div className="route-details">
            <div>
              <span>Route</span>
              <strong>
                {method === "unified"
                  ? "Circle Gateway → Arc Testnet"
                  : `${selected?.label} → Arc Testnet`}
              </strong>
            </div>
            {method === "unified" && (
              <div>
                <span>Available balance</span>
                <strong>
                  {unifiedBalance
                    ? `${unifiedBalance.total} USDC · ${unifiedBalance.chains} funded chain${unifiedBalance.chains === 1 ? "" : "s"}`
                    : "Check first"}
                </strong>
              </div>
            )}
            {quote?.fees.map((fee) => (
              <div key={`${fee.label}-${fee.detail ?? ""}`}>
                <span>{fee.detail ? `${fee.label} · ${fee.detail}` : fee.label}</span>
                <strong>{fee.amount}</strong>
              </div>
            )) ?? (
              <div>
                <span>Route fees</span>
                <strong>Estimate first</strong>
              </div>
            )}
            <div>
              <span>ETA</span>
              <strong>
                <Clock3 size={13} />{" "}
                {method === "bridge" && directArc
                  ? "No bridge required"
                  : "Route dependent"}
              </strong>
            </div>
          </div>

          {quote && (
            <section className="funding-readiness" aria-live="polite">
              <div className="readiness-heading">
                <div>
                  <span>Funding readiness</span>
                  <small>
                    {readiness
                      ? readinessPassed
                        ? "Ready to continue"
                        : "Action needed before funding"
                      : "Check before continuing"}
                  </small>
                </div>
                <button
                  className="button button-quiet readiness-button"
                  type="button"
                  onClick={() => void runReadinessCheck()}
                  disabled={readinessChecking || busy}
                >
                  {readinessChecking ? "Checking…" : readiness ? "Check again" : "Run check"}
                </button>
              </div>
              {readiness ? (
                <ul>
                  {readiness.map((item) => (
                    <li className={item.status} key={item.id}>
                      <span>{item.status === "ready" ? <Check size={13} /> : <Info size={13} />}</span>
                      <div>
                        <strong>{item.label}</strong>
                        <p>{item.detail}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="readiness-empty">
                  Confirm the wallet, USDC amount, selected route, and fee buffer before a transaction is requested.
                </p>
              )}
            </section>
          )}

          {error && <div className="form-error" role="alert">{error}</div>}
          {method === "bridge" && directArc && quote && (
            <div className="gateway-disclosure">
              <Info size={14} />
              <span>
                Arc has no bridge fee here. The wallet shows the small Arc
                network fee for approval and funding, paid from the same USDC
                balance.
              </span>
            </div>
          )}
          {quote && (
            <div className="gateway-disclosure">
              <Info size={14} />
              <span>
                The escrow always locks the exact agreement amount. Route and
                network fees are separate from the USDC shown above.
              </span>
            </div>
          )}
          {method === "unified" && (
            <div className="gateway-disclosure">
              <Info size={14} />
              <span>
                This route spends USDC already deposited in Circle Gateway.
                Regular wallet USDC should use Arc / Bridge.
              </span>
            </div>
          )}
          {method === "unified" && gatewaySync !== "idle" && (
            <div className={`gateway-sync-status ${gatewaySync}`} role="status">
              {gatewaySync === "confirmed"
                ? "Gateway sync confirmed that USDC arrived on Arc."
                : gatewaySync === "checking"
                  ? "Checking the Arc USDC balance for the Gateway arrival…"
                  : "Gateway is still indexing the transfer. Check the Arc arrival again when ready."}
            </div>
          )}
          {!quote ? (
            <button
              className="button button-primary funding-button"
              type="button"
              onClick={() => void estimate()}
              disabled={busy}
            >
              {busy
                ? "Checking with Circle App Kit…"
                : method === "unified"
                  ? "Check Gateway route"
                  : "Estimate funding route"}
              {!busy && <ArrowRight size={16} />}
            </button>
          ) : (
            <button
              className="button button-primary funding-button"
              type="button"
              disabled={busy || confirmed || readinessChecking || gatewaySync === "checking"}
              onClick={() => {
                if (method === "unified" && gatewaySync === "waiting") {
                  resumeGatewayArrivalCheck();
                  return;
                }
                void (readinessPassed ? continueFunding() : runReadinessCheck());
              }}
            >
              {busy
                ? "Waiting for wallet confirmation..."
                : readinessChecking
                  ? "Checking funding readiness..."
                  : readinessPassed
                    ? actionLabel
                    : "Run funding readiness check"}
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
