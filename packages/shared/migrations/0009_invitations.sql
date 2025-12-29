-- Create Invitations table
CREATE TABLE IF NOT EXISTS invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text UNIQUE NOT NULL,
    role text NOT NULL,
    university_id uuid REFERENCES universities(id) ON DELETE CASCADE,
    token text UNIQUE NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT NOW(),
    invited_by uuid REFERENCES users(id) ON DELETE SET NULL
);

-- Add status to users if not exists (or just use is_active)
-- For now, we'll use a separate table for invitations to avoid polluting users with non-logged-in data.
