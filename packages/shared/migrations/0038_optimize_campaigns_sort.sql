-- Add index for ordering campaigns by creation date
CREATE INDEX IF NOT EXISTS campaigns_created_at_desc_idx ON campaigns(created_at DESC);
