-- Budget Proposals Email Logs
CREATE TABLE IF NOT EXISTS budget_proposal_email_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id uuid NOT NULL REFERENCES budget_proposals(id) ON DELETE CASCADE,
    event_type text NOT NULL, -- APPROVED, REJECTED, CHANGES_REQUESTED
    recipient_email text NOT NULL,
    status text NOT NULL, -- SENT, FAILED
    provider_message_id text,
    failure_reason text,
    created_at timestamptz DEFAULT now()
);

-- Index for searching logs by proposal
CREATE INDEX IF NOT EXISTS idx_budget_proposal_email_logs_proposal ON budget_proposal_email_logs(proposal_id);
