CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`agreement_id` text NOT NULL,
	`milestone_id` text,
	`actor_wallet_id` text,
	`type` text NOT NULL,
	`detail` text,
	`tx_hash` text,
	`occurred_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`agreement_id`) REFERENCES `agreements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`milestone_id`) REFERENCES `milestones`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_wallet_id`) REFERENCES `wallets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `activity_agreement_time_idx` ON `activities` (`agreement_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `agreements` (
	`id` text PRIMARY KEY NOT NULL,
	`public_ref` text NOT NULL,
	`contract_address` text,
	`agreement_hash` text NOT NULL,
	`title` text NOT NULL,
	`client_wallet_id` text NOT NULL,
	`provider_wallet_id` text,
	`provider_invite_hash` text,
	`currency` text DEFAULT 'USDC' NOT NULL,
	`total_amount_minor` text NOT NULL,
	`state` text DEFAULT 'awaiting_funding' NOT NULL,
	`chain_id` integer NOT NULL,
	`funded_tx_hash` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_wallet_id`) REFERENCES `wallets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`provider_wallet_id`) REFERENCES `wallets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agreements_public_ref_unique` ON `agreements` (`public_ref`);--> statement-breakpoint
CREATE INDEX `agreements_client_state_idx` ON `agreements` (`client_wallet_id`,`state`);--> statement-breakpoint
CREATE INDEX `agreements_provider_state_idx` ON `agreements` (`provider_wallet_id`,`state`);--> statement-breakpoint
CREATE TABLE `chain_events` (
	`id` text PRIMARY KEY NOT NULL,
	`chain_id` integer NOT NULL,
	`tx_hash` text NOT NULL,
	`log_index` integer NOT NULL,
	`block_number` text NOT NULL,
	`agreement_id` text,
	`event_name` text NOT NULL,
	`amount_minor` text,
	`payload` text,
	`confirmed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`agreement_id`) REFERENCES `agreements`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chain_event_identity_unique` ON `chain_events` (`chain_id`,`tx_hash`,`log_index`);--> statement-breakpoint
CREATE INDEX `chain_event_agreement_idx` ON `chain_events` (`agreement_id`);--> statement-breakpoint
CREATE TABLE `deliverables` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`object_key` text NOT NULL,
	`content_hash` text NOT NULL,
	`original_name` text NOT NULL,
	`media_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deliverable_object_key_unique` ON `deliverables` (`object_key`);--> statement-breakpoint
CREATE INDEX `deliverable_submission_idx` ON `deliverables` (`submission_id`);--> statement-breakpoint
CREATE TABLE `idempotency_keys` (
	`key` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`wallet_id` text,
	`request_hash` text NOT NULL,
	`response_code` integer,
	`response_body` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idempotency_expiry_idx` ON `idempotency_keys` (`expires_at`);--> statement-breakpoint
CREATE TABLE `milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`agreement_id` text NOT NULL,
	`position` integer NOT NULL,
	`milestone_hash` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`amount_minor` text NOT NULL,
	`due_at` integer NOT NULL,
	`review_window_seconds` integer NOT NULL,
	`revision_limit` integer NOT NULL,
	`revisions_used` integer DEFAULT 0 NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`released_tx_hash` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`agreement_id`) REFERENCES `agreements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `milestone_agreement_position_unique` ON `milestones` (`agreement_id`,`position`);--> statement-breakpoint
CREATE INDEX `milestone_agreement_state_idx` ON `milestones` (`agreement_id`,`state`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`milestone_id` text NOT NULL,
	`submission_hash` text NOT NULL,
	`note` text,
	`submitted_by_wallet_id` text NOT NULL,
	`submitted_at` integer NOT NULL,
	`tx_hash` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`milestone_id`) REFERENCES `milestones`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`submitted_by_wallet_id`) REFERENCES `wallets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `submission_milestone_time_idx` ON `submissions` (`milestone_id`,`submitted_at`);--> statement-breakpoint
CREATE TABLE `wallets` (
	`id` text PRIMARY KEY NOT NULL,
	`address` text NOT NULL,
	`chain_id` integer NOT NULL,
	`display_name` text,
	`last_signed_in_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wallet_chain_address_unique` ON `wallets` (`chain_id`,`address`);