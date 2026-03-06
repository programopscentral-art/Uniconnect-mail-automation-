-- Add category and file_content to budget_proposal_attachments
ALTER TABLE budget_proposal_attachments ADD COLUMN IF NOT EXISTS category text DEFAULT 'SUPPORTING';
ALTER TABLE budget_proposal_attachments ADD COLUMN IF NOT EXISTS file_content text; -- Storing as Base64 for cross-server visibility
