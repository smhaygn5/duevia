import assert from "node:assert/strict";
import test from "node:test";
import { ARC } from "../lib/arc/config";
import {
  createSignInMessage,
  sha256,
  sha256Bytes,
} from "../lib/auth/core";

test("wallet sign-in challenge is origin-bound, expiring, and Arc-specific", () => {
  const message = createSignInMessage({
    address: `0x${"12".repeat(20)}`,
    origin: "https://duevia.example",
    nonce: "nonce-123",
    issuedAt: "2026-07-25T10:00:00.000Z",
    expirationTime: "2026-07-25T10:10:00.000Z",
  });
  assert.match(message, /duevia\.example wants you to sign in/);
  assert.match(message, new RegExp(`Chain ID: ${ARC.chainId}`));
  assert.match(message, /Nonce: nonce-123/);
  assert.match(message, /Expiration Time: 2026-07-25T10:10:00\.000Z/);
});

test("raw deliverable hashing matches the standard SHA-256 vector", async () => {
  const bytes = new TextEncoder().encode("abc");
  const expected =
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
  assert.equal(await sha256Bytes(bytes), expected);
  assert.equal(await sha256("abc"), expected);
});
