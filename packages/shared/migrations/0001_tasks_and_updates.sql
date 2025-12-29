-- Migration: Add Tasks table and update Campaigns/Templates schema

-- Add missing fields to templates
ALTER TABLE templates ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Add missing fields to campaigns
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS recipient_email_key text;

-- Create Tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    description text,
    assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
    assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
    university_id uuid REFERENCES universities(id) ON DELETE CASCADE,
    status text NOT NULL CHECK (status IN ('PENDING', 'COMPLETED', 'CANCELLED')) DEFAULT 'PENDING',
    due_date timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tasks_assigned_to_idx ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS tasks_university_id_idx ON tasks(university_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks(status);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_tasks_updated_at') THEN
        CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
END $$;
