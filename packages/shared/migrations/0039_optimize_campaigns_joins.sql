-- Add indices to speed up campaign list JOINs
CREATE INDEX IF NOT EXISTS campaigns_template_id_idx ON campaigns(template_id);
CREATE INDEX IF NOT EXISTS campaigns_mailbox_id_idx ON campaigns(mailbox_id);
