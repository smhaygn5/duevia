CREATE TABLE IF NOT EXISTS `disputes` (
  `id` text PRIMARY KEY NOT NULL,
  `agreement_id` text NOT NULL,
  `milestone_id` text,
  `opened_by_wallet_id` text NOT NULL,
  `category` text NOT NULL,
  `status` text DEFAULT 'open' NOT NULL,
  `proposed_resolution` text,
  `proposed_by_wallet_id` text,
  `proposal_event_id` text,
  `accepted_by_wallet_id` text,
  `opened_at` integer NOT NULL,
  `resolved_at` integer,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`agreement_id`) REFERENCES `agreements`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`milestone_id`) REFERENCES `milestones`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`opened_by_wallet_id`) REFERENCES `wallets`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`proposed_by_wallet_id`) REFERENCES `wallets`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`accepted_by_wallet_id`) REFERENCES `wallets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `dispute_agreement_time_idx`
  ON `disputes` (`agreement_id`, `opened_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `dispute_agreement_status_idx`
  ON `disputes` (`agreement_id`, `status`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `dispute_one_active_per_agreement`
  ON `disputes` (`agreement_id`) WHERE `status` != 'resolved';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `dispute_events` (
  `id` text PRIMARY KEY NOT NULL,
  `dispute_id` text NOT NULL,
  `actor_wallet_id` text NOT NULL,
  `kind` text NOT NULL,
  `statement` text NOT NULL,
  `evidence_url` text,
  `evidence_sha256` text,
  `resolution_type` text,
  `signature` text NOT NULL,
  `occurred_at` integer NOT NULL,
  FOREIGN KEY (`dispute_id`) REFERENCES `disputes`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`actor_wallet_id`) REFERENCES `wallets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `dispute_event_dispute_time_idx`
  ON `dispute_events` (`dispute_id`, `occurred_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `dispute_event_signature_unique`
  ON `dispute_events` (`signature`);
--> statement-breakpoint
PRAGMA optimize;
