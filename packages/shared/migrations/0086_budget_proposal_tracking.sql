-- Budget Proposal Tracking — Amazon-style order tracking for procurement.
-- Status updates from Facilities OS flow in via webhook and are visible
-- to the requester and CM in UniConnect.

CREATE TABLE IF NOT EXISTS budget_proposal_tracking (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id uuid NOT NULL REFERENCES budget_proposals(id) ON DELETE CASCADE,
    status text NOT NULL,
    title text NOT NULL,
    description text,
    updated_by_name text,
    updated_by_email text,
    attachment_urls text[],
    source text NOT NULL DEFAULT 'uniconnect', -- 'uniconnect' | 'facilities'
    metadata jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bpt_proposal ON budget_proposal_tracking(proposal_id);
CREATE INDEX IF NOT EXISTS idx_bpt_created ON budget_proposal_tracking(proposal_id, created_at);

-- Backfill existing approvals into the tracking table so proposals
-- that were approved before this feature show a timeline.
INSERT INTO budget_proposal_tracking (proposal_id, status, title, description, updated_by_name, source, created_at)
SELECT
    bp.id,
    'submitted',
    'Proposal Submitted',
    bp.title,
    bp.proposer_name,
    'uniconnect',
    bp.created_at
FROM budget_proposals bp
WHERE NOT EXISTS (SELECT 1 FROM budget_proposal_tracking t WHERE t.proposal_id = bp.id)
ON CONFLICT DO NOTHING;
