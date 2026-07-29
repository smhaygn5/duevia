import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type {
  AgreementState,
  MilestoneState,
} from "../lib/domain/agreement-state";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
};

export const wallets = sqliteTable(
  "wallets",
  {
    id: text("id").primaryKey(),
    address: text("address").notNull(),
    chainId: integer("chain_id").notNull(),
    displayName: text("display_name"),
    lastSignedInAt: integer("last_signed_in_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("wallet_chain_address_unique").on(
      table.chainId,
      table.address,
    ),
  ],
);

export const authChallenges = sqliteTable(
  "auth_challenges",
  {
    id: text("id").primaryKey(),
    address: text("address").notNull(),
    chainId: integer("chain_id").notNull(),
    message: text("message").notNull(),
    nonce: text("nonce").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    usedAt: integer("used_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("auth_challenge_nonce_unique").on(table.nonce),
    index("auth_challenge_address_expiry_idx").on(
      table.address,
      table.expiresAt,
    ),
  ],
);

export const walletSessions = sqliteTable(
  "wallet_sessions",
  {
    id: text("id").primaryKey(),
    walletId: text("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("wallet_session_token_unique").on(table.tokenHash),
    index("wallet_session_wallet_expiry_idx").on(
      table.walletId,
      table.expiresAt,
    ),
  ],
);

export const agreements = sqliteTable(
  "agreements",
  {
    id: text("id").primaryKey(),
    publicRef: text("public_ref").notNull(),
    contractAddress: text("contract_address"),
    agreementHash: text("agreement_hash").notNull(),
    title: text("title").notNull(),
    creatorWalletId: text("creator_wallet_id")
      .notNull()
      .references(() => wallets.id),
    creatorRole: text("creator_role")
      .$type<"client" | "provider">()
      .notNull(),
    clientWalletId: text("client_wallet_id").references(() => wallets.id),
    providerWalletId: text("provider_wallet_id").references(() => wallets.id),
    counterpartyName: text("counterparty_name").notNull(),
    counterpartyEmail: text("counterparty_email"),
    inviteHash: text("invite_hash").notNull(),
    currency: text("currency").notNull().default("USDC"),
    totalAmountMinor: text("total_amount_minor").notNull(),
    state: text("state")
      .$type<AgreementState>()
      .notNull()
      .default("awaiting_funding"),
    chainId: integer("chain_id").notNull(),
    fundedTxHash: text("funded_tx_hash"),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("agreements_public_ref_unique").on(table.publicRef),
    uniqueIndex("agreements_invite_hash_unique").on(table.inviteHash),
    index("agreements_creator_state_idx").on(
      table.creatorWalletId,
      table.state,
    ),
    index("agreements_client_state_idx").on(
      table.clientWalletId,
      table.state,
    ),
    index("agreements_provider_state_idx").on(
      table.providerWalletId,
      table.state,
    ),
  ],
);

export const milestones = sqliteTable(
  "milestones",
  {
    id: text("id").primaryKey(),
    agreementId: text("agreement_id")
      .notNull()
      .references(() => agreements.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    milestoneHash: text("milestone_hash").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    amountMinor: text("amount_minor").notNull(),
    dueAt: integer("due_at", { mode: "timestamp_ms" }).notNull(),
    reviewWindowSeconds: integer("review_window_seconds").notNull(),
    revisionLimit: integer("revision_limit").notNull(),
    revisionsUsed: integer("revisions_used").notNull().default(0),
    state: text("state")
      .$type<MilestoneState>()
      .notNull()
      .default("pending"),
    releasedTxHash: text("released_tx_hash"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("milestone_agreement_position_unique").on(
      table.agreementId,
      table.position,
    ),
    index("milestone_agreement_state_idx").on(
      table.agreementId,
      table.state,
    ),
  ],
);

export const submissions = sqliteTable(
  "submissions",
  {
    id: text("id").primaryKey(),
    milestoneId: text("milestone_id")
      .notNull()
      .references(() => milestones.id, { onDelete: "cascade" }),
    submissionHash: text("submission_hash").notNull(),
    note: text("note"),
    submittedByWalletId: text("submitted_by_wallet_id")
      .notNull()
      .references(() => wallets.id),
    submittedAt: integer("submitted_at", { mode: "timestamp_ms" }).notNull(),
    txHash: text("tx_hash"),
    ...timestamps,
  },
  (table) => [
    index("submission_milestone_time_idx").on(
      table.milestoneId,
      table.submittedAt,
    ),
  ],
);

export const deliverables = sqliteTable(
  "deliverables",
  {
    id: text("id").primaryKey(),
    submissionId: text("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    contentHash: text("content_hash").notNull(),
    originalName: text("original_name").notNull(),
    mediaType: text("media_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("deliverable_object_key_unique").on(table.objectKey),
    index("deliverable_submission_idx").on(table.submissionId),
  ],
);

export const activities = sqliteTable(
  "activities",
  {
    id: text("id").primaryKey(),
    agreementId: text("agreement_id")
      .notNull()
      .references(() => agreements.id, { onDelete: "cascade" }),
    milestoneId: text("milestone_id").references(() => milestones.id),
    actorWalletId: text("actor_wallet_id").references(() => wallets.id),
    type: text("type").notNull(),
    detail: text("detail", { mode: "json" }).$type<Record<string, unknown>>(),
    txHash: text("tx_hash"),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
    ...timestamps,
  },
  (table) => [
    index("activity_agreement_time_idx").on(
      table.agreementId,
      table.occurredAt,
    ),
    uniqueIndex("activity_tx_hash_unique").on(table.txHash),
  ],
);

export const chainEvents = sqliteTable(
  "chain_events",
  {
    id: text("id").primaryKey(),
    chainId: integer("chain_id").notNull(),
    txHash: text("tx_hash").notNull(),
    logIndex: integer("log_index").notNull(),
    blockNumber: text("block_number").notNull(),
    agreementId: text("agreement_id").references(() => agreements.id),
    eventName: text("event_name").notNull(),
    amountMinor: text("amount_minor"),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>(),
    confirmedAt: integer("confirmed_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("chain_event_identity_unique").on(
      table.chainId,
      table.txHash,
      table.logIndex,
    ),
    index("chain_event_agreement_idx").on(table.agreementId),
  ],
);

export const idempotencyKeys = sqliteTable(
  "idempotency_keys",
  {
    key: text("key").primaryKey(),
    scope: text("scope").notNull(),
    walletId: text("wallet_id").references(() => wallets.id),
    requestHash: text("request_hash").notNull(),
    responseCode: integer("response_code"),
    responseBody: text("response_body", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    ...timestamps,
  },
  (table) => [index("idempotency_expiry_idx").on(table.expiresAt)],
);

export const apiRateLimits = sqliteTable(
  "api_rate_limits",
  {
    key: text("key").primaryKey(),
    windowStartedAt: integer("window_started_at").notNull(),
    requestCount: integer("request_count").notNull().default(1),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("api_rate_limit_window_idx").on(table.windowStartedAt),
  ],
);
