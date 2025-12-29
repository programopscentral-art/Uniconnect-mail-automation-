-- Add unique constraint to campaign_recipients to prevent duplicate emails to the same student in a campaign
ALTER TABLE campaign_recipients ADD CONSTRAINT campaign_student_unique UNIQUE (campaign_id, student_id);
