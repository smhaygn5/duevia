import assert from "node:assert/strict";
import test from "node:test";
import { canAcceptChangeOrder } from "../lib/agreements/change-order";

test("only the counterparty can accept a pending change order", () => {
  assert.equal(canAcceptChangeOrder("wallet-a", "wallet-a", "pending"), false);
  assert.equal(canAcceptChangeOrder("wallet-a", "wallet-b", "pending"), true);
  assert.equal(canAcceptChangeOrder("wallet-a", "wallet-b", "accepted"), false);
});
