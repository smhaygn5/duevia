import { keccak256, stringToHex, type Hex } from "viem";

export function storedProof(value: string): Hex {
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("A stored agreement proof is invalid.");
  }
  return normalized as Hex;
}

export function agreementOnchainRef(input: {
  version: number;
  publicRef: string;
  agreementHash: string;
}): Hex {
  const proof = storedProof(input.agreementHash);
  if (input.version < 2) return proof;
  return keccak256(
    stringToHex(
      `duevia:agreement:v2:${input.publicRef.toUpperCase()}:${proof.slice(2).toLowerCase()}`,
    ),
  );
}

export function agreementRecoveryCandidates(input: {
  version: number;
  publicRef: string;
  agreementHash: string;
}) {
  const current = {
    version: input.version,
    agreementRef: agreementOnchainRef(input),
  };
  if (input.version < 2) return [current];

  const legacy = {
    version: 1,
    agreementRef: agreementOnchainRef({ ...input, version: 1 }),
  };
  return current.agreementRef.toLowerCase() ===
    legacy.agreementRef.toLowerCase()
    ? [current]
    : [current, legacy];
}

export function milestoneOnchainRef(input: {
  version: number;
  publicRef: string;
  milestoneHash: string;
}): Hex {
  const proof = storedProof(input.milestoneHash);
  if (input.version < 2) return proof;
  return keccak256(
    stringToHex(
      `duevia:milestone:v2:${input.publicRef.toUpperCase()}:${proof.slice(2).toLowerCase()}`,
    ),
  );
}
