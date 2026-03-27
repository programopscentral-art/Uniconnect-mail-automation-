-- Security PIN for two-step verification on PII/document access
ALTER TABLE users ADD COLUMN IF NOT EXISTS security_pin_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_set_at TIMESTAMPTZ;
