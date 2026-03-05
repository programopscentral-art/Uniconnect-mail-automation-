-- Budget Proposals Module Migration

-- 1. Create Enums
DO $$ BEGIN
    CREATE TYPE budget_proposal_status AS ENUM (
        'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 
        'APPROVED', 'REJECTED', 'EVENT_COMPLETED', 'REPORT_SUBMITTED', 'CLOSED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE budget_item_category AS ENUM (
        'VENUE', 'FOOD', 'SPEAKER', 'TRAVEL', 'MARKETING', 'MISC'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Budget Proposals Table
CREATE TABLE IF NOT EXISTS budget_proposals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    title text NOT NULL,
    event_type text NOT NULL,
    proposer_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    proposer_name text,
    proposer_email text NOT NULL,
    proposed_date timestamptz NOT NULL,
    venue text,
    expected_attendance int,
    description text,
    priority text NOT NULL DEFAULT 'MED', -- LOW, MED, HIGH
    estimated_total_budget decimal(12,2) NOT NULL DEFAULT 0,
    approved_total_budget decimal(12,2),
    status budget_proposal_status NOT NULL DEFAULT 'DRAFT',
    version int NOT NULL DEFAULT 1,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 3. Budget Proposal Items (Breakdown)
CREATE TABLE IF NOT EXISTS budget_proposal_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id uuid NOT NULL REFERENCES budget_proposals(id) ON DELETE CASCADE,
    category budget_item_category NOT NULL,
    description text NOT NULL,
    qty int NOT NULL DEFAULT 1,
    unit_cost decimal(12,2) NOT NULL DEFAULT 0,
    amount decimal(12,2) NOT NULL DEFAULT 0,
    vendor_name text,
    quotation_url text,
    created_at timestamptz DEFAULT now()
);

-- 4. Budget Proposal Attachments
CREATE TABLE IF NOT EXISTS budget_proposal_attachments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id uuid NOT NULL REFERENCES budget_proposals(id) ON DELETE CASCADE,
    file_url text NOT NULL,
    file_name text NOT NULL,
    file_type text,
    uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at timestamptz DEFAULT now()
);

-- 5. Budget Proposal Comments
CREATE TABLE IF NOT EXISTS budget_proposal_comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id uuid NOT NULL REFERENCES budget_proposals(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_name text,
    comment text NOT NULL,
    visibility text NOT NULL DEFAULT 'PUBLIC', -- INTERNAL or PUBLIC
    created_at timestamptz DEFAULT now()
);

-- 6. Budget Proposal Reports
CREATE TABLE IF NOT EXISTS budget_proposal_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id uuid NOT NULL REFERENCES budget_proposals(id) ON DELETE CASCADE,
    actual_date timestamptz NOT NULL,
    actual_attendance int,
    actual_budget_used decimal(12,2),
    remaining_budget decimal(12,2),
    outcomes text,
    feedback_summary text,
    issues_faced text,
    photos_urls text[] DEFAULT '{}',
    report_attachment_url text,
    submitted_by uuid NOT NULL REFERENCES users(id),
    submitted_at timestamptz DEFAULT now(),
    UNIQUE(proposal_id)
);

-- 7. Audit Log
CREATE TABLE IF NOT EXISTS budget_proposal_audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id uuid NOT NULL REFERENCES budget_proposals(id) ON DELETE CASCADE,
    action text NOT NULL, -- STATUS_CHANGE, EDIT, COMMENT, REPORT_SUBMIT, NOTIFICATION_SENT, EMAIL_SENT
    from_status budget_proposal_status,
    to_status budget_proposal_status,
    payload_json jsonb,
    actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    actor_name text,
    created_at timestamptz DEFAULT now()
);

-- 8. Indices for university filtering
CREATE INDEX IF NOT EXISTS idx_budget_proposals_university ON budget_proposals(university_id);
CREATE INDEX IF NOT EXISTS idx_budget_proposals_status ON budget_proposals(status);
CREATE INDEX IF NOT EXISTS idx_budget_proposals_proposer ON budget_proposals(proposer_user_id);

-- 9. Trigger for updated_at
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_budget_proposals_updated_at') THEN
        CREATE TRIGGER update_budget_proposals_updated_at BEFORE UPDATE ON budget_proposals FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
END $$;
