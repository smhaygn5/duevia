import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

function migration(name: string) {
  return readFileSync(new URL(`../drizzle/${name}`, import.meta.url), "utf8");
}

test("phase four migration preserves legacy agreements and accepts provider-created agreements", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(migration("0000_mighty_marvel_apes.sql"));
  const now = Date.now();
  db.prepare(
    `INSERT INTO wallets (
      id, address, chain_id, display_name, last_signed_in_at, created_at, updated_at
    ) VALUES (?, ?, ?, NULL, NULL, ?, ?)`,
  ).run("wallet-1", `0x${"11".repeat(20)}`, 5_042_002, now, now);
  db.prepare(
    `INSERT INTO agreements (
      id, public_ref, contract_address, agreement_hash, title,
      client_wallet_id, provider_wallet_id, provider_invite_hash, currency,
      total_amount_minor, state, chain_id, funded_tx_hash, version,
      created_at, updated_at
    ) VALUES (?, ?, NULL, ?, ?, ?, NULL, ?, 'USDC', ?, 'awaiting_funding',
      ?, NULL, 1, ?, ?)`,
  ).run(
    "agreement-legacy",
    "DV-OLD1",
    "legacy-hash",
    "Legacy agreement",
    "wallet-1",
    "legacy-invite",
    "1000000",
    5_042_002,
    now,
    now,
  );

  db.exec(migration("0001_phase_four.sql"));

  const migrated = db
    .prepare(
      `SELECT creator_wallet_id, creator_role, counterparty_name, invite_hash
       FROM agreements WHERE id = ?`,
    )
    .get("agreement-legacy") as Record<string, unknown>;
  assert.equal(migrated.creator_wallet_id, "wallet-1");
  assert.equal(migrated.creator_role, "client");
  assert.equal(migrated.counterparty_name, "Invited provider");
  assert.equal(migrated.invite_hash, "legacy-invite");

  db.prepare(
    `INSERT INTO agreements (
      id, public_ref, contract_address, agreement_hash, title,
      creator_wallet_id, creator_role, client_wallet_id, provider_wallet_id,
      counterparty_name, counterparty_email, invite_hash, currency,
      total_amount_minor, state, chain_id, funded_tx_hash, version,
      created_at, updated_at
    ) VALUES (?, ?, NULL, ?, ?, ?, 'provider', NULL, ?, ?, NULL, ?,
      'USDC', ?, 'awaiting_funding', ?, NULL, 1, ?, ?)`,
  ).run(
    "agreement-provider",
    "DV-NEW1",
    "new-hash",
    "Provider agreement",
    "wallet-1",
    "wallet-1",
    "Global client",
    "new-invite",
    "2500000",
    5_042_002,
    now,
    now,
  );

  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('auth_challenges', 'wallet_sessions') ORDER BY name",
    )
    .all()
    .map((row) => row.name);
  assert.deepEqual(tables, ["auth_challenges", "wallet_sessions"]);
  db.close();
});
