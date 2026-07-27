import { ARC } from "@/lib/arc/config";

export async function sha256Bytes(value: BufferSource) {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  return sha256Bytes(bytes);
}

export function randomToken(size = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export function createSignInMessage(params: {
  address: string;
  origin: string;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
}) {
  const domain = new URL(params.origin).host;
  return `${domain} wants you to sign in with your Ethereum account:
${params.address}

Sign in to Duevia. This proves wallet ownership, costs no gas, and does not submit a transaction.

URI: ${params.origin}
Version: 1
Chain ID: ${ARC.chainId}
Nonce: ${params.nonce}
Issued At: ${params.issuedAt}
Expiration Time: ${params.expirationTime}`;
}

export function resolveAuthOrigin(params: {
  requestUrl: string;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
}) {
  const fallbackOrigin = new URL(params.requestUrl).origin;
  const forwardedHost = params.forwardedHost?.split(",")[0]?.trim();
  const forwardedProto = params.forwardedProto
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();

  if (!forwardedHost || forwardedProto !== "https") {
    return fallbackOrigin;
  }

  try {
    const forwardedUrl = new URL(`https://${forwardedHost}`);
    if (
      forwardedUrl.username ||
      forwardedUrl.password ||
      forwardedUrl.pathname !== "/" ||
      forwardedUrl.search ||
      forwardedUrl.hash
    ) {
      return fallbackOrigin;
    }
    return forwardedUrl.origin;
  } catch {
    return fallbackOrigin;
  }
}
