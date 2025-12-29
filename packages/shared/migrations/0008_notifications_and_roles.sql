-- Update User Roles check constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('ADMIN', 'PROGRAM_OPS', 'UNIVERSITY_OPERATOR', 'COS', 'PM', 'PMA', 'BOA'));

-- Create Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    university_id uuid REFERENCES universities(id) ON DELETE CASCADE,
    title text NOT NULL,
    message text NOT NULL,
    type text NOT NULL CHECK (type IN ('ACCESS_REQUEST', 'DEADLINE_REMINDER', 'CAMPAIGN_UPDATE', 'SYSTEM')),
    link text,
    is_read boolean NOT NULL DEFAULT false,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_is_read_idx ON notifications(is_read);

-- Update Audit Logs to track who sends mails more specifically
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS university_id uuid REFERENCES universities(id) ON DELETE SET NULL;
