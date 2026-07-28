import assert from "node:assert/strict";
import test from "node:test";
import {
  dueviaEscrowAbi,
  formatContractError,
} from "../lib/contracts/duevia";

test("escrow client reads milestones through the deployed contract getter", () => {
  assert.equal(
    dueviaEscrowAbi.some(
      (item) => item.type === "function" && item.name === "getMilestone",
    ),
    true,
  );
  assert.equal(
    dueviaEscrowAbi.some(
      (item) =>
        item.type === "function" && String(item.name) === "milestones",
    ),
    false,
  );
});

test("contract failures are converted to concise user-facing guidance", () => {
  const raw = new Error(
    'The contract function "createEscrow" reverted: AgreementAlreadyDeployed()',
  );
  assert.equal(
    formatContractError(raw),
    "This agreement already has an Arc escrow. Reload the agreement before continuing.",
  );
  assert.doesNotMatch(formatContractError(raw), /createEscrow|reverted/i);
  assert.match(
    formatContractError(new Error("RPC error: request limit reached")),
    /temporarily busy/i,
  );
});
