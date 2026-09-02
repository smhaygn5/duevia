import assert from "node:assert/strict";
import test from "node:test";
import {
  contentHashLabel,
  shortContentHash,
} from "../lib/agreements/delivery-integrity";

test("content hashes are shortened without hiding their algorithm", () => {
  const hash = "a".repeat(64);
  assert.equal(shortContentHash(hash), `${"a".repeat(12)}…${"a".repeat(12)}`);
  assert.equal(contentHashLabel(hash), `SHA-256 · ${"a".repeat(12)}…${"a".repeat(12)}`);
});
