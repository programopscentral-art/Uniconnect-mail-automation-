-- Enable pgcrypto for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Tables

CREATE TABLE IF NOT EXISTS universities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_universities_updated_at') THEN
        CREATE TRIGGER update_universities_updated_at BEFORE UPDATE ON universities FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE,
    name text,
    role text NOT NULL CHECK (role IN ('ADMIN','UNIVERSITY_OPERATOR')),
    university_id uuid NULL REFERENCES universities(id) ON DELETE SET NULL,
    is_active boolean NOT NULL DEFAULT true,
    last_login_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_users_updated_at') THEN
        CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    created_at timestamptz DEFAULT now(),
    expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS students (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    name text NOT NULL,
    email text NOT NULL,
    external_id text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(university_id, email)
);
CREATE INDEX IF NOT EXISTS students_university_id_idx ON students(university_id);
CREATE INDEX IF NOT EXISTS students_university_external_id_idx ON students(university_id, external_id);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_students_updated_at') THEN
        CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON students FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS mailbox_connections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    email text NOT NULL,
    google_subject text,
    refresh_token_enc text NOT NULL,
    scopes text NOT NULL,
    status text NOT NULL CHECK (status IN ('ACTIVE','REVOKED')) DEFAULT 'ACTIVE',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(university_id, email)
);
CREATE INDEX IF NOT EXISTS mailbox_connections_university_id_idx ON mailbox_connections(university_id);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_mailbox_connections_updated_at') THEN
        CREATE TRIGGER update_mailbox_connections_updated_at BEFORE UPDATE ON mailbox_connections FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id uuid NULL REFERENCES universities(id) ON DELETE CASCADE,
    name text NOT NULL,
    subject text NOT NULL,
    html text NOT NULL,
    created_by_user_id uuid NOT NULL REFERENCES users(id),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS templates_university_id_idx ON templates(university_id);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_templates_updated_at') THEN
        CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON templates FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS campaigns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    name text NOT NULL,
    template_id uuid NOT NULL REFERENCES templates(id),
    mailbox_id uuid NOT NULL REFERENCES mailbox_connections(id),
    status text NOT NULL CHECK (status IN ('DRAFT','SCHEDULED','IN_PROGRESS','COMPLETED','FAILED')) DEFAULT 'DRAFT',
    scheduled_at timestamptz,
    started_at timestamptz,
    completed_at timestamptz,
    created_by_user_id uuid NOT NULL REFERENCES users(id),
    total_recipients int NOT NULL DEFAULT 0,
    sent_count int NOT NULL DEFAULT 0,
    open_count int NOT NULL DEFAULT 0,
    ack_count int NOT NULL DEFAULT 0,
    failed_count int NOT NULL DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS campaigns_university_id_idx ON campaigns(university_id);
CREATE INDEX IF NOT EXISTS campaigns_status_idx ON campaigns(status);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_campaigns_updated_at') THEN
        CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS campaign_recipients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    to_email text NOT NULL,
    status text NOT NULL CHECK (status IN ('PENDING','QUEUED','SENT','FAILED','OPENED','ACKNOWLEDGED')) DEFAULT 'PENDING',
    gmail_message_id text,
    error_message text,
    sent_at timestamptz,
    opened_at timestamptz,
    acknowledged_at timestamptz,
    open_count int NOT NULL DEFAULT 0,
    tracking_token text NOT NULL UNIQUE,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS campaign_recipients_campaign_status_idx ON campaign_recipients(campaign_id, status);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_campaign_recipients_updated_at') THEN
        CREATE TRIGGER update_campaign_recipients_updated_at BEFORE UPDATE ON campaign_recipients FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text,
    meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at);
