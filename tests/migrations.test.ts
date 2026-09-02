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

test("unique escrow reference migration upgrades only agreements without deployments", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(migration("0000_mighty_marvel_apes.sql"));
  const now = Date.now();
  db.prepare(
    `INSERT INTO wallets (
      id, address, chain_id, display_name, last_signed_in_at, created_at, updated_at
    ) VALUES (?, ?, ?, NULL, NULL, ?, ?)`,
  ).run("wallet-migration", `0x${"22".repeat(20)}`, 5_042_002, now, now);
  const insert = db.prepare(
    `INSERT INTO agreements (
      id, public_ref, contract_address, agreement_hash, title,
      client_wallet_id, provider_wallet_id, provider_invite_hash, currency,
      total_amount_minor, state, chain_id, funded_tx_hash, version,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'USDC', ?, 'awaiting_funding',
      ?, NULL, 1, ?, ?)`,
  );
  insert.run(
    "agreement-pending",
    "DV-PENDING",
    null,
    "pending-hash",
    "Pending deployment",
    "wallet-migration",
    "pending-invite",
    "1000000",
    5_042_002,
    now,
    now,
  );
  insert.run(
    "agreement-deployed",
    "DV-DEPLOYED",
    `0x${"33".repeat(20)}`,
    "deployed-hash",
    "Existing deployment",
    "wallet-migration",
    "deployed-invite",
    "1000000",
    5_042_002,
    now,
    now,
  );

  db.exec(migration("0003_unique_escrow_refs.sql"));

  const rows = db
    .prepare("SELECT id, version FROM agreements ORDER BY id")
    .all()
    .map((row) => ({ id: String(row.id), version: Number(row.version) }));
  assert.deepEqual(rows, [
    { id: "agreement-deployed", version: 1 },
    { id: "agreement-pending", version: 2 },
  ]);
  db.close();
});

test("dispute migration stores signed events against an agreement", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE wallets (id TEXT PRIMARY KEY NOT NULL);
    CREATE TABLE agreements (id TEXT PRIMARY KEY NOT NULL);
    CREATE TABLE milestones (id TEXT PRIMARY KEY NOT NULL);
  `);
  db.exec(migration("0005_dispute_resolution.sql"));
  db.prepare("INSERT INTO wallets (id) VALUES (?)").run("wallet-client");
  db.prepare("INSERT INTO agreements (id) VALUES (?)").run("agreement-1");
  db.prepare(
    `INSERT INTO disputes (
      id, agreement_id, milestone_id, opened_by_wallet_id, category, status,
      proposed_resolution, proposed_by_wallet_id, proposal_event_id,
      accepted_by_wallet_id, opened_at, resolved_at, updated_at
    ) VALUES (?, ?, NULL, ?, 'delivery', 'open', NULL, NULL, NULL, NULL, ?, NULL, ?)`,
  ).run("dispute-1", "agreement-1", "wallet-client", 100, 100);
  db.prepare(
    `INSERT INTO dispute_events (
      id, dispute_id, actor_wallet_id, kind, statement, evidence_url,
      evidence_sha256, resolution_type, signature, occurred_at
    ) VALUES (?, ?, ?, 'opened', ?, NULL, NULL, NULL, ?, ?)`,
  ).run("event-1", "dispute-1", "wallet-client", "Delivery was incomplete.", "0x1234", 100);

  const event = db.prepare("SELECT kind, signature FROM dispute_events WHERE dispute_id = ?").get("dispute-1") as Record<string, unknown>;
  assert.equal(event.kind, "opened");
  assert.equal(event.signature, "0x1234");
  assert.throws(() => db.prepare(
    `INSERT INTO dispute_events (id, dispute_id, actor_wallet_id, kind, statement, signature, occurred_at)
     VALUES ('event-2', 'dispute-1', 'wallet-client', 'evidence', 'Duplicate', '0x1234', 101)`,
  ).run(), /UNIQUE/);
  assert.throws(() => db.prepare(
    `INSERT INTO disputes (
      id, agreement_id, opened_by_wallet_id, category, status, opened_at, updated_at
    ) VALUES ('dispute-2', 'agreement-1', 'wallet-client', 'scope', 'open', 101, 101)`,
  ).run(), /UNIQUE/);
  db.close();
});
