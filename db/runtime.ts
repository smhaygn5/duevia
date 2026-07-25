import { env } from "cloudflare:workers";

type DueviaBindings = {
  DB?: D1Database;
  DELIVERABLES?: R2Bucket;
};

let schemaReady: Promise<void> | undefined;

export function getBindings() {
  return env as unknown as DueviaBindings;
}

export function getRawDb() {
  const db = getBindings().DB;
  if (!db) {
    throw new Error("Duevia D1 binding is unavailable.");
  }
  return db;
}

export function getDeliverablesBucket() {
  const bucket = getBindings().DELIVERABLES;
  if (!bucket) {
    throw new Error("Duevia R2 binding is unavailable.");
  }
  return bucket;
}

export function ensureRuntimeSchema() {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    const db = getRawDb();
    const statements = [
      `CREATE TABLE IF NOT EXISTS wallets (
        id TEXT PRIMARY KEY NOT NULL,
        address TEXT NOT NULL,
        chain_id INTEGER NOT NULL,
        display_name TEXT,
        last_signed_in_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS wallet_chain_address_unique
        ON wallets (chain_id, address)`,
      `CREATE TABLE IF NOT EXISTS auth_challenges (
        id TEXT PRIMARY KEY NOT NULL,
        address TEXT NOT NULL,
        chain_id INTEGER NOT NULL,
        message TEXT NOT NULL,
        nonce TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        used_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS auth_challenge_nonce_unique
        ON auth_challenges (nonce)`,
      `CREATE INDEX IF NOT EXISTS auth_challenge_address_expiry_idx
        ON auth_challenges (address, expires_at)`,
      `CREATE TABLE IF NOT EXISTS wallet_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        revoked_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS wallet_session_token_unique
        ON wallet_sessions (token_hash)`,
      `CREATE INDEX IF NOT EXISTS wallet_session_wallet_expiry_idx
        ON wallet_sessions (wallet_id, expires_at)`,
      `CREATE TABLE IF NOT EXISTS agreements (
        id TEXT PRIMARY KEY NOT NULL,
        public_ref TEXT NOT NULL,
        contract_address TEXT,
        agreement_hash TEXT NOT NULL,
        title TEXT NOT NULL,
        creator_wallet_id TEXT NOT NULL REFERENCES wallets(id),
        creator_role TEXT NOT NULL,
        client_wallet_id TEXT REFERENCES wallets(id),
        provider_wallet_id TEXT REFERENCES wallets(id),
        counterparty_name TEXT NOT NULL,
        counterparty_email TEXT,
        invite_hash TEXT NOT NULL,
        currency TEXT DEFAULT 'USDC' NOT NULL,
        total_amount_minor TEXT NOT NULL,
        state TEXT DEFAULT 'awaiting_funding' NOT NULL,
        chain_id INTEGER NOT NULL,
        funded_tx_hash TEXT,
        version INTEGER DEFAULT 1 NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS agreements_public_ref_unique
        ON agreements (public_ref)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS agreements_invite_hash_unique
        ON agreements (invite_hash)`,
      `CREATE INDEX IF NOT EXISTS agreements_creator_state_idx
        ON agreements (creator_wallet_id, state)`,
      `CREATE TABLE IF NOT EXISTS milestones (
        id TEXT PRIMARY KEY NOT NULL,
        agreement_id TEXT NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        milestone_hash TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        amount_minor TEXT NOT NULL,
        due_at INTEGER NOT NULL,
        review_window_seconds INTEGER NOT NULL,
        revision_limit INTEGER NOT NULL,
        revisions_used INTEGER DEFAULT 0 NOT NULL,
        state TEXT DEFAULT 'pending' NOT NULL,
        released_tx_hash TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS milestone_agreement_position_unique
        ON milestones (agreement_id, position)`,
      `CREATE TABLE IF NOT EXISTS submissions (
        id TEXT PRIMARY KEY NOT NULL,
        milestone_id TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
        submission_hash TEXT NOT NULL,
        note TEXT,
        submitted_by_wallet_id TEXT NOT NULL REFERENCES wallets(id),
        submitted_at INTEGER NOT NULL,
        tx_hash TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS submission_milestone_time_idx
        ON submissions (milestone_id, submitted_at)`,
      `CREATE TABLE IF NOT EXISTS deliverables (
        id TEXT PRIMARY KEY NOT NULL,
        submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
        object_key TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        original_name TEXT NOT NULL,
        media_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS deliverable_object_key_unique
        ON deliverables (object_key)`,
      `CREATE INDEX IF NOT EXISTS deliverable_submission_idx
        ON deliverables (submission_id)`,
      `CREATE TABLE IF NOT EXISTS activities (
        id TEXT PRIMARY KEY NOT NULL,
        agreement_id TEXT NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
        milestone_id TEXT REFERENCES milestones(id),
        actor_wallet_id TEXT REFERENCES wallets(id),
        type TEXT NOT NULL,
        detail TEXT,
        tx_hash TEXT,
        occurred_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS activity_agreement_time_idx
        ON activities (agreement_id, occurred_at)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS activity_tx_hash_unique
        ON activities (tx_hash)`,
    ];

    await db.batch(statements.map((statement) => db.prepare(statement)));
  })().catch((error) => {
    schemaReady = undefined;
    throw error;
  });

  return schemaReady;
}
