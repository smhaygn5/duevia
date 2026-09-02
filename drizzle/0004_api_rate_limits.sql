CREATE TABLE IF NOT EXISTS `api_rate_limits` (
  `key` text PRIMARY KEY NOT NULL,
  `window_started_at` integer NOT NULL,
  `request_count` integer DEFAULT 1 NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `api_rate_limit_window_idx`
  ON `api_rate_limits` (`window_started_at`);
