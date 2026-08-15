import assert from "node:assert/strict";
import test from "node:test";
import { isSettlementReceipt, receiptTitle } from "../lib/agreements/receipt-title";

test("settlement archive keeps only terminal settlement receipts", () => {
  assert.equal(isSettlementReceipt("milestone.released"), true);
  assert.equal(isSettlementReceipt("agreement.refunded"), true);
  assert.equal(isSettlementReceipt("agreement.funded"), false);
  assert.equal(receiptTitle("milestone.released"), "Milestone approved");
});
