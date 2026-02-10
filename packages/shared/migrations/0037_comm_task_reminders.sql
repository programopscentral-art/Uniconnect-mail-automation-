-- Add reminder tracking columns to communication_tasks
ALTER TABLE communication_tasks
ADD COLUMN IF NOT EXISTS creation_notified_at timestamptz,
ADD COLUMN IF NOT EXISTS day_start_notified_at timestamptz,
ADD COLUMN IF NOT EXISTS ten_min_reminder_sent boolean DEFAULT false;
