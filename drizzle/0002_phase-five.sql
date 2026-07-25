CREATE UNIQUE INDEX IF NOT EXISTS `activity_tx_hash_unique`
  ON `activities` (`tx_hash`);
