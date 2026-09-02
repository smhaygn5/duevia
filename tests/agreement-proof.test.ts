import assert from "node:assert/strict";
import test from "node:test";
import {
  agreementOnchainRef,
  agreementRecoveryCandidates,
  milestoneOnchainRef,
  storedProof,
} from "../lib/agreements/onchain-proof";

const agreementHash = "11".repeat(32);
const milestoneHash = "22".repeat(32);

test("legacy agreements keep their original onchain proofs", () => {
  assert.equal(
    agreementOnchainRef({
      version: 1,
      publicRef: "DV-LEGACY",
      agreementHash,
    }),
    storedProof(agreementHash),
  );
  assert.equal(
    milestoneOnchainRef({
      version: 1,
      publicRef: "DV-LEGACY",
      milestoneHash,
    }),
    storedProof(milestoneHash),
  );
});

test("version two onchain proofs are unique per agreement", () => {
  const first = agreementOnchainRef({
    version: 2,
    publicRef: "DV-FIRST",
    agreementHash,
  });
  const second = agreementOnchainRef({
    version: 2,
    publicRef: "DV-SECOND",
    agreementHash,
  });
  assert.notEqual(first, second);
  assert.equal(
    first,
    agreementOnchainRef({
      version: 2,
      publicRef: "dv-first",
      agreementHash,
    }),
  );

  assert.notEqual(
    milestoneOnchainRef({
      version: 2,
      publicRef: "DV-FIRST",
      milestoneHash,
    }),
    milestoneOnchainRef({
      version: 2,
      publicRef: "DV-SECOND",
      milestoneHash,
    }),
  );
});

test("stored proofs reject malformed hashes", () => {
  assert.throws(() => storedProof("not-a-proof"), /stored agreement proof/i);
});

test("recovery checks the current proof before a legacy orphan proof", () => {
  const candidates = agreementRecoveryCandidates({
    version: 2,
    publicRef: "DV-ORPHAN",
    agreementHash,
  });
  assert.deepEqual(
    candidates.map((candidate) => candidate.version),
    [2, 1],
  );
  assert.equal(candidates[1]?.agreementRef, storedProof(agreementHash));
  assert.deepEqual(
    agreementRecoveryCandidates({
      version: 1,
      publicRef: "DV-LEGACY",
      agreementHash,
    }).map((candidate) => candidate.version),
    [1],
  );
});
