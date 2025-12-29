-- Add email_domain to universities if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='universities' AND column_name='email_domain') THEN
        ALTER TABLE universities ADD COLUMN email_domain text;
    END IF;
END $$;

-- Create access_requests table if not exists
CREATE TABLE IF NOT EXISTS access_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    university_ids uuid[] NOT NULL,
    status text NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')) DEFAULT 'PENDING',
    admin_notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Indices if not exist (using DO block for safety if preferred, but usually they error gracefully or can be ignored)
CREATE INDEX IF NOT EXISTS access_requests_user_id_idx ON access_requests(user_id);
CREATE INDEX IF NOT EXISTS access_requests_status_idx ON access_requests(status);

-- Create trigger if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_access_requests_updated_at') THEN
        CREATE TRIGGER update_access_requests_updated_at 
        BEFORE UPDATE ON access_requests 
        FOR EACH ROW 
        EXECUTE PROCEDURE update_updated_at_column();
    END IF;
END $$;
