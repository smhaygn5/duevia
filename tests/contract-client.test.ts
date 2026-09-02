import assert from "node:assert/strict";
import test from "node:test";
import {
  dueviaEscrowAbi,
  formatContractError,
  fundingBalanceError,
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
  assert.match(
    formatContractError(new Error("insufficient funds for gas")),
    /same USDC balance/i,
  );
});

test("funding balance checks reserve the shared Arc USDC balance for gas", () => {
  assert.match(
    fundingBalanceError(
      { usdc: 2_000_000n },
      3_000_000n,
    ) ?? "",
    /2 USDC.*3 USDC plus.*network fee/i,
  );
  assert.match(
    fundingBalanceError(
      { usdc: 3_000_000n },
      3_000_000n,
    ) ?? "",
    /exactly 3 USDC.*same balance/i,
  );
  assert.equal(
    fundingBalanceError(
      { usdc: 3_010_000n },
      3_000_000n,
    ),
    null,
  );
});
