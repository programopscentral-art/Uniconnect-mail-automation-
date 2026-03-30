-- Convert meetings system from university-based to user-based
-- Each user connects their own Google account and sees only their own meetings

-- Add user_id to meeting_connections, make university_id nullable
ALTER TABLE meeting_connections ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE meeting_connections ALTER COLUMN university_id DROP NOT NULL;

-- Add user_id to org_meetings, make university_id nullable
ALTER TABLE org_meetings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE org_meetings ALTER COLUMN university_id DROP NOT NULL;

-- Backfill user_id from connected_by where available
UPDATE meeting_connections SET user_id = connected_by WHERE user_id IS NULL AND connected_by IS NOT NULL;
UPDATE org_meetings SET user_id = mc.user_id
FROM meeting_connections mc
WHERE org_meetings.meeting_connection_id = mc.id
  AND org_meetings.user_id IS NULL
  AND mc.user_id IS NOT NULL;

-- New indexes for user-based queries
CREATE INDEX IF NOT EXISTS idx_meeting_connections_user ON meeting_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_org_meetings_user ON org_meetings(user_id);

-- Change unique constraint: one connection per user email
ALTER TABLE meeting_connections DROP CONSTRAINT IF EXISTS meeting_connections_email_key;
ALTER TABLE meeting_connections ADD CONSTRAINT meeting_connections_user_email_key UNIQUE(user_id, email);
