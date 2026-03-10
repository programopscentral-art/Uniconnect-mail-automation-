-- Add role intent and subject selection to access requests
ALTER TABLE access_requests
    ADD COLUMN IF NOT EXISTS role_intent TEXT,          -- 'FACULTY', 'STAFF', etc.
    ADD COLUMN IF NOT EXISTS requested_subject_ids TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Index for filtering by role
CREATE INDEX IF NOT EXISTS idx_access_requests_role_intent ON access_requests(role_intent);
