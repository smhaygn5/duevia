CREATE TABLE IF NOT EXISTS `change_orders` (
  `id` text PRIMARY KEY NOT NULL,
  `agreement_id` text NOT NULL,
  `proposer_wallet_id` text NOT NULL,
  `accepted_by_wallet_id` text,
  `title` text NOT NULL,
  `detail` text NOT NULL,
  `scope` text NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `created_at` integer NOT NULL,
  `accepted_at` integer,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`agreement_id`) REFERENCES `agreements`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`proposer_wallet_id`) REFERENCES `wallets`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`accepted_by_wallet_id`) REFERENCES `wallets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `change_order_agreement_time_idx`
  ON `change_orders` (`agreement_id`, `created_at`);
--> statement-breakpoint
PRAGMA optimize;
