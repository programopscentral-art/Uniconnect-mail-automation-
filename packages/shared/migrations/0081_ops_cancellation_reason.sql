-- Add cancellation_reason column to ops_daily_data
ALTER TABLE ops_daily_data ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
