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

  for (const message of candidates) {
    try {
      if (
        await verifyOnchain({
          address: input.address,
          message,
          signature: input.signature,
        })
      ) {
        return true;
      }
    } catch {
      // A failed RPC or contract check must not turn an invalid signature valid.
    }
  }

  return false;
}
