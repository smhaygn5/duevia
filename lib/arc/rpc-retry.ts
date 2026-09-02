function rpcErrorText(error: unknown, depth = 0): string {
  if (depth > 5 || typeof error !== "object" || error === null) return "";
  const candidate = error as {
    message?: unknown;
    shortMessage?: unknown;
    details?: unknown;
    cause?: unknown;
    code?: unknown;
  };
  return [
    typeof candidate.message === "string" ? candidate.message : "",
    typeof candidate.shortMessage === "string" ? candidate.shortMessage : "",
    typeof candidate.details === "string" ? candidate.details : "",
    String(candidate.code ?? ""),
    rpcErrorText(candidate.cause, depth + 1),
  ].join(" ");
}

export function isArcRpcBusy(error: unknown) {
  const detail = rpcErrorText(error).toLowerCase();
  return (
    detail.includes("request limit reached") ||
    detail.includes("rate limit") ||
    detail.includes("too many requests") ||
    detail.includes("-32011") ||
    detail.includes("429")
  );
}

export async function withArcRpcRetry<T>(operation: () => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isArcRpcBusy(error) || attempt === 2) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, 200 * (attempt + 1)),
      );
    }
  }
  throw lastError;
}
