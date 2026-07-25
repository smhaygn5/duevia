PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_agreements` (
	`id` text PRIMARY KEY NOT NULL,
	`public_ref` text NOT NULL,
	`contract_address` text,
	`agreement_hash` text NOT NULL,
	`title` text NOT NULL,
	`creator_wallet_id` text NOT NULL,
	`creator_role` text NOT NULL,
	`client_wallet_id` text,
	`provider_wallet_id` text,
	`counterparty_name` text NOT NULL,
	`counterparty_email` text,
	`invite_hash` text NOT NULL,
	`currency` text DEFAULT 'USDC' NOT NULL,
	`total_amount_minor` text NOT NULL,
	`state` text DEFAULT 'awaiting_funding' NOT NULL,
	`chain_id` integer NOT NULL,
	`funded_tx_hash` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`creator_wallet_id`) REFERENCES `wallets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_wallet_id`) REFERENCES `wallets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`provider_wallet_id`) REFERENCES `wallets`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_agreements` (
	`id`, `public_ref`, `contract_address`, `agreement_hash`, `title`,
	`creator_wallet_id`, `creator_role`, `client_wallet_id`, `provider_wallet_id`,
	`counterparty_name`, `counterparty_email`, `invite_hash`, `currency`,
	`total_amount_minor`, `state`, `chain_id`, `funded_tx_hash`, `version`,
	`created_at`, `updated_at`
)
SELECT
	`id`, `public_ref`, `contract_address`, `agreement_hash`, `title`,
	`client_wallet_id`, 'client', `client_wallet_id`, `provider_wallet_id`,
	'Invited provider', NULL, COALESCE(`provider_invite_hash`, 'legacy-' || `id`),
	`currency`, `total_amount_minor`, `state`, `chain_id`, `funded_tx_hash`,
	`version`, `created_at`, `updated_at`
FROM `agreements`;--> statement-breakpoint
DROP TABLE `agreements`;--> statement-breakpoint
ALTER TABLE `__new_agreements` RENAME TO `agreements`;--> statement-breakpoint
CREATE UNIQUE INDEX `agreements_public_ref_unique` ON `agreements` (`public_ref`);--> statement-breakpoint
CREATE UNIQUE INDEX `agreements_invite_hash_unique` ON `agreements` (`invite_hash`);--> statement-breakpoint
CREATE INDEX `agreements_creator_state_idx` ON `agreements` (`creator_wallet_id`,`state`);--> statement-breakpoint
CREATE INDEX `agreements_client_state_idx` ON `agreements` (`client_wallet_id`,`state`);--> statement-breakpoint
CREATE INDEX `agreements_provider_state_idx` ON `agreements` (`provider_wallet_id`,`state`);--> statement-breakpoint
CREATE TABLE `auth_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`address` text NOT NULL,
	`chain_id` integer NOT NULL,
	`message` text NOT NULL,
	`nonce` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX `auth_challenge_nonce_unique` ON `auth_challenges` (`nonce`);--> statement-breakpoint
CREATE INDEX `auth_challenge_address_expiry_idx` ON `auth_challenges` (`address`,`expires_at`);--> statement-breakpoint
CREATE TABLE `wallet_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`wallet_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `wallet_session_token_unique` ON `wallet_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `wallet_session_wallet_expiry_idx` ON `wallet_sessions` (`wallet_id`,`expires_at`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
