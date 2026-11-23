ALTER TABLE change_orders ADD COLUMN proposer_signature TEXT;
ALTER TABLE change_orders ADD COLUMN proposer_signed_message TEXT;
ALTER TABLE change_orders ADD COLUMN proposer_address TEXT;
ALTER TABLE change_orders ADD COLUMN proposer_signed_at INTEGER;
ALTER TABLE change_orders ADD COLUMN acceptance_signature TEXT;
ALTER TABLE change_orders ADD COLUMN acceptance_signed_message TEXT;
ALTER TABLE change_orders ADD COLUMN acceptance_address TEXT;
ALTER TABLE change_orders ADD COLUMN acceptance_signed_at INTEGER;
