-- Create Communication Tasks table
CREATE TABLE IF NOT EXISTS communication_tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    universities text[] NOT NULL,
    channel text NOT NULL,
    assigned_to uuid[] NOT NULL, -- References users(id)
    message_title text NOT NULL,
    message_body text NOT NULL,
    scheduled_at timestamptz NOT NULL,
    priority text NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High')),
    status text NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled', 'Notified', 'Completed', 'Canceled')),
    notified_at timestamptz,
    marked_sent_at timestamptz,
    notes text,
    created_by uuid NOT NULL REFERENCES users(id),
    created_at timestamptz DEFAULT now()
);

-- Create User FCM Tokens table
CREATE TABLE IF NOT EXISTS user_fcm_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fcm_token text NOT NULL UNIQUE,
    last_active timestamptz DEFAULT now(),
    device_info jsonb,
    created_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS communication_tasks_scheduled_at_idx ON communication_tasks(scheduled_at);
CREATE INDEX IF NOT EXISTS communication_tasks_status_idx ON communication_tasks(status);
CREATE INDEX IF NOT EXISTS user_fcm_tokens_user_id_idx ON user_fcm_tokens(user_id);
