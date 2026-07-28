export type BridgeStepLike = {
  name: string;
  state: string;
  error?: unknown;
  errorMessage?: string;
  errorCategory?: string;
};

export type BridgeResultLike = {
  state: string;
  steps: readonly BridgeStepLike[];
};

export class ArcBridgeError extends Error {
  readonly canResume: boolean;

  constructor(message: string, canResume = false) {
    super(message);
    this.name = "ArcBridgeError";
    this.canResume = canResume;
  }
}

export function isArcBridgeError(error: unknown): error is ArcBridgeError {
  return error instanceof ArcBridgeError;
}

function errorText(error: unknown, depth = 0): string {
  if (depth > 5 || typeof error !== "object" || error === null) return "";
  const candidate = error as {
    name?: unknown;
    message?: unknown;
    shortMessage?: unknown;
    details?: unknown;
    cause?: unknown;
    code?: unknown;
  };
  return [
    typeof candidate.name === "string" ? candidate.name : "",
    typeof candidate.shortMessage === "string" ? candidate.shortMessage : "",
    typeof candidate.details === "string" ? candidate.details : "",
    typeof candidate.message === "string" ? candidate.message : "",
    String(candidate.code ?? ""),
    errorText(candidate.cause, depth + 1),
  ].join(" ");
}

function readableStepName(name: string) {
  switch (name) {
    case "approve":
      return "USDC approval";
    case "burn":
      return "source-chain burn";
    case "fetchAttestation":
      return "Circle attestation";
    case "mint":
      return "Arc mint";
    case "batch":
      return "wallet batch";
    default:
      return "bridge";
  }
}

function conciseDetail(detail: string) {
  const firstLine = detail
    .split(/\r?\n/, 1)[0]
    ?.replace(/^Error:\s*/i, "")
    .trim();
  if (!firstLine || firstLine.length > 220) return null;
  return firstLine;
}

export function bridgeResultError(
  result: BridgeResultLike,
  sourceLabel: string,
) {
  const failed = result.steps.find((step) => step.state === "error");
  const completed = result.steps.filter((step) => step.state === "success");
  const burnConfirmed = completed.some((step) => step.name === "burn");
  const canResume = burnConfirmed || completed.length > 0;
  const detail = [
    failed?.errorCategory ?? "",
    failed?.errorMessage ?? "",
    errorText(failed?.error),
  ]
    .join(" ")
    .toLowerCase();

  if (
    detail.includes("user_rejected") ||
    detail.includes("user rejected") ||
    detail.includes("user denied") ||
    detail.includes("4001")
  ) {
    return new ArcBridgeError(
      canResume
        ? "A bridge step was already confirmed before the wallet request was cancelled. Select Resume USDC bridge to continue without starting over."
        : "The wallet request was cancelled.",
      canResume,
    );
  }
  if (
    detail.includes("insufficient") ||
    detail.includes("exceeds balance") ||
    detail.includes("balance too low")
  ) {
    return new ArcBridgeError(
      `The source wallet does not have enough USDC or gas on ${sourceLabel} for this route.`,
      canResume,
    );
  }
  if (
    detail.includes("atomic_unsupported") ||
    detail.includes("eip-7702") ||
    detail.includes("wallet_sendcalls")
  ) {
    return new ArcBridgeError(
      "This wallet cannot batch the bridge requests. Duevia now uses separate approval and bridge confirmations; try the route again.",
    );
  }
  if (
    detail.includes("switch to chain") ||
    detail.includes("chain mismatch") ||
    detail.includes("unsupported chain")
  ) {
    return new ArcBridgeError(
      `The wallet did not finish switching to ${sourceLabel}. Approve the network change in the wallet and try again.`,
      canResume,
    );
  }
  if (burnConfirmed) {
    return new ArcBridgeError(
      `The USDC burn on ${sourceLabel} is already confirmed. Do not start a new transfer; select Resume USDC bridge to finish minting on Arc.`,
      true,
    );
  }
  if (canResume) {
    return new ArcBridgeError(
      `The bridge stopped after ${readableStepName(completed.at(-1)?.name ?? "")}. Select Resume USDC bridge to continue safely.`,
      true,
    );
  }

  const visibleDetail = conciseDetail(
    failed?.errorMessage ?? errorText(failed?.error),
  );
  return new ArcBridgeError(
    visibleDetail
      ? `Circle stopped at ${readableStepName(failed?.name ?? "")}: ${visibleDetail}`
      : `Circle could not start the USDC route from ${sourceLabel}. Check the source balance and network fee.`,
  );
}

export function formatArcBridgeError(
  error: unknown,
  sourceLabel: string,
) {
  if (isArcBridgeError(error)) return error.message;
  const detail = errorText(error);
  const normalized = detail.toLowerCase();
  if (
    normalized.includes("user rejected") ||
    normalized.includes("user denied") ||
    normalized.includes("4001")
  ) {
    return "The wallet request was cancelled.";
  }
  if (
    normalized.includes("insufficient") ||
    normalized.includes("exceeds balance")
  ) {
    return `The source wallet does not have enough USDC or gas on ${sourceLabel} for this route.`;
  }
  if (
    normalized.includes("switch to chain") ||
    normalized.includes("chain mismatch")
  ) {
    return `The wallet did not finish switching to ${sourceLabel}. Approve the network change and try again.`;
  }
  const visibleDetail = conciseDetail(
    error instanceof Error ? error.message : detail,
  );
  return visibleDetail
    ? `Circle could not complete the route: ${visibleDetail}`
    : `Circle could not complete the route from ${sourceLabel}. Check the source balance and try again.`;
}
