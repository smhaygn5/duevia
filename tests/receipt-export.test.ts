import assert from "node:assert/strict";
import test from "node:test";
import { receiptExportFilename, receiptExportText } from "../lib/agreements/receipt-export";

const receipt = { status: "Confirmed", title: "Milestone approved", agreement: "DV-TEST", milestone: "02 · Product build", amount: "250 USDC", recipient: "0xabc", network: "Arc Testnet", date: "Aug 14", txHash: "0x123", approvalChecklist: ["Files reviewed"] };

test("receipt export includes the settlement proof and checklist", () => {
  const text = receiptExportText(receipt);
  assert.match(text, /Arc transaction: 0x123/);
  assert.match(text, /- Files reviewed/);
  assert.equal(receiptExportFilename(receipt), "duevia-dv-test-02-product-build.txt");
});
