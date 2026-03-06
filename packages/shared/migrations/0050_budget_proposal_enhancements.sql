-- Add new budget item categories
ALTER TYPE budget_item_category ADD VALUE IF NOT EXISTS 'AWARDS';
ALTER TYPE budget_item_category ADD VALUE IF NOT EXISTS 'RECOGNITION';
ALTER TYPE budget_item_category ADD VALUE IF NOT EXISTS 'HOSPITALITY';
ALTER TYPE budget_item_category ADD VALUE IF NOT EXISTS 'CERTIFICATES';
ALTER TYPE budget_item_category ADD VALUE IF NOT EXISTS 'GIFTS';

-- Add multi-stage approval statuses
ALTER TYPE budget_proposal_status ADD VALUE IF NOT EXISTS 'APPROVED_L1';
ALTER TYPE budget_proposal_status ADD VALUE IF NOT EXISTS 'APPROVED_L2';

-- Ensure we can query them immediately
COMMIT;
