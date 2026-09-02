export type FundingStepStatus = "active" | "complete" | "pending";

export type FundingTimelineRoute = "direct" | "bridge" | "gateway";

export type FundingTimelineStep = {
  id: "wallet" | "route" | "arrival" | "escrow";
  title: string;
  detail: string;
  status: FundingStepStatus;
};

export function fundingStepStatuses(input: {
  prepared: boolean;
  transactionSubmitted: boolean;
  confirmed: boolean;
}): [FundingStepStatus, FundingStepStatus, FundingStepStatus] {
  if (input.confirmed) return ["complete", "complete", "complete"];
  if (input.transactionSubmitted) {
    return ["complete", "complete", "active"];
  }
  if (input.prepared) return ["complete", "active", "pending"];
  return ["active", "pending", "pending"];
}

export function fundingTimelineSteps(input: {
  walletConfirmed: boolean;
  route: FundingTimelineRoute;
  routePrepared: boolean;
  routeInFlight: boolean;
  routeComplete: boolean;
  escrowInFlight: boolean;
  escrowFunded: boolean;
}): FundingTimelineStep[] {
  const routeReady =
    input.route === "direct" && input.routePrepared
      ? true
      : input.routeComplete;

  return [
    {
      id: "wallet",
      title: "Wallet confirmed",
      detail: input.walletConfirmed
        ? "The agreement client wallet is connected."
        : "Connect the client wallet to begin.",
      status: input.walletConfirmed ? "complete" : "active",
    },
    {
      id: "route",
      title:
        input.route === "direct" ? "Arc balance selected" : "USDC route started",
      detail:
        input.route === "direct"
          ? "USDC will be funded from the connected Arc wallet."
          : input.route === "gateway"
            ? "Circle Gateway is preparing USDC for Arc."
            : "Circle is moving USDC from the selected source network.",
      status: routeReady
        ? "complete"
        : input.routeInFlight
          ? "active"
          : "pending",
    },
    {
      id: "arrival",
      title:
        input.route === "direct" ? "USDC available on Arc" : "USDC arrived on Arc",
      detail:
        input.route === "direct"
          ? "No bridge is required for this route."
          : "USDC is ready for the isolated agreement escrow.",
      status: routeReady ? "complete" : "pending",
    },
    {
      id: "escrow",
      title: "Escrow locked",
      detail: input.escrowFunded
        ? "Funding is confirmed on Arc. The provider can now begin."
        : input.escrowInFlight
          ? "Arc is confirming the escrow transaction."
          : "Deploy, approve, and lock the agreement total on Arc.",
      status: input.escrowFunded
        ? "complete"
        : input.escrowInFlight
          ? "active"
          : "pending",
    },
  ];
}
