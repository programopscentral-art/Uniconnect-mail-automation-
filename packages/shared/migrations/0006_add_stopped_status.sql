-- Add STOPPED and CANCELLED statuses
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_status_check CHECK (status IN ('DRAFT', 'SCHEDULED', 'QUEUED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'STOPPED'));

-- Add CANCELLED to recipients
ALTER TABLE campaign_recipients DROP CONSTRAINT IF EXISTS campaign_recipients_status_check;
ALTER TABLE campaign_recipients ADD CONSTRAINT campaign_recipients_status_check CHECK (status IN ('PENDING', 'QUEUED', 'SENT', 'FAILED', 'OPENED', 'ACKNOWLEDGED', 'CANCELLED'));
