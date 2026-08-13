import assert from "node:assert/strict";
import test from "node:test";
import { proofStateLabel, publicProofUrl } from "../lib/agreements/public-proof";

test("public proof links normalize an agreement reference", () => {
  assert.equal(publicProofUrl("DV-7K2P"), "/proof/dv-7k2p");
  assert.equal(proofStateLabel("awaiting_funding"), "Awaiting Funding");
});
