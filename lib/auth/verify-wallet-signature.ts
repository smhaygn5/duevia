import {
  stringToHex,
  verifyMessage,
  type Address,
  type Hex,
  type SignableMessage,
} from "viem";
import { createArcPublicClient } from "@/lib/arc/rpc";

type VerificationInput = {
  address: Address;
  message: string;
  signature: Hex;
};

type OnchainVerifier = (input: {
  address: Address;
  message: SignableMessage;
  signature: Hex;
}) => Promise<boolean>;

function messageCandidates(message: string): SignableMessage[] {
  return [message, stringToHex(message)];
}

async function verifyOnchainWithDeadline(
  verifyOnchain: OnchainVerifier,
  input: Parameters<OnchainVerifier>[0],
) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timeoutId = setTimeout(() => resolve(false), 8_000);
  });
  try {
    return await Promise.race([
      verifyOnchain(input).catch(() => false),
      timeout,
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function verifyWalletSignature(
  input: VerificationInput,
  verifyOnchain: OnchainVerifier = (parameters) =>
    createArcPublicClient().verifyMessage(parameters),
) {
  const candidates = messageCandidates(input.message);

  for (const message of candidates) {
    try {
      if (
        await verifyMessage({
          address: input.address,
          message,
          signature: input.signature,
        })
      ) {
        return true;
      }
    } catch {
      // Contract-wallet and non-standard signatures cannot be recovered locally.
    }
  }

  const onchainResults = await Promise.all(
    candidates.map((message) =>
      verifyOnchainWithDeadline(verifyOnchain, {
        address: input.address,
        message,
        signature: input.signature,
      }),
    ),
  );
  return onchainResults.some(Boolean);
}
