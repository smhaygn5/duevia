import assert from "node:assert/strict";
import test from "node:test";
import { stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ARC } from "../lib/arc/config";
import {
  createSignInMessage,
  resolveAuthOrigin,
  sha256,
  sha256Bytes,
} from "../lib/auth/core";
import { verifyWalletSignature } from "../lib/auth/verify-wallet-signature";

const testAccount = privateKeyToAccount(
  `0x${"11".repeat(32)}`,
);

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

test("wallet sign-in uses the public origin forwarded by the Vercel bridge", () => {
  assert.equal(
    resolveAuthOrigin({
      requestUrl: "https://private-backend.example/api/auth/challenge",
      forwardedHost: "duevia.vercel.app",
      forwardedProto: "https",
    }),
    "https://duevia.vercel.app",
  );
});

test("wallet sign-in ignores unsafe forwarded origins", () => {
  const requestUrl = "https://private-backend.example/api/auth/challenge";

  assert.equal(
    resolveAuthOrigin({
      requestUrl,
      forwardedHost: "duevia.vercel.app/forged",
      forwardedProto: "https",
    }),
    "https://private-backend.example",
  );
  assert.equal(
    resolveAuthOrigin({
      requestUrl,
      forwardedHost: "duevia.vercel.app",
      forwardedProto: "http",
    }),
    "https://private-backend.example",
  );
});

test("raw deliverable hashing matches the standard SHA-256 vector", async () => {
  const bytes = new TextEncoder().encode("abc");
  const expected =
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
  assert.equal(await sha256Bytes(bytes), expected);
  assert.equal(await sha256("abc"), expected);
});

test("wallet authentication accepts a standard EIP-191 signature", async () => {
  const message = "Sign in to Duevia";
  const signature = await testAccount.signMessage({ message });

  assert.equal(
    await verifyWalletSignature(
      {
        address: testAccount.address,
        message,
        signature,
      },
      async () => false,
    ),
    true,
  );
});

test("wallet authentication accepts wallets that sign the displayed hex literally", async () => {
  const message = "Sign in to Duevia";
  const signature = await testAccount.signMessage({
    message: stringToHex(message),
  });

  assert.equal(
    await verifyWalletSignature(
      {
        address: testAccount.address,
        message,
        signature,
      },
      async () => false,
    ),
    true,
  );
});

test("wallet authentication falls back to Arc for smart-account signatures", async () => {
  const signature = `0x${"22".repeat(65)}` as const;
  let onchainChecks = 0;

  const valid = await verifyWalletSignature(
    {
      address: testAccount.address,
      message: "Sign in to Duevia",
      signature,
    },
    async () => {
      onchainChecks += 1;
      return true;
    },
  );

  assert.equal(valid, true);
  assert.equal(onchainChecks, 1);
});
