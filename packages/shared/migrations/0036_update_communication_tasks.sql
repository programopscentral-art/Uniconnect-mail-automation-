-- Add new fields to communication_tasks table
ALTER TABLE communication_tasks
ADD COLUMN IF NOT EXISTS update_type text DEFAULT 'Announcement' CHECK (update_type IN ('Announcement', 'Reminder', 'Event Campaign', 'Positive Message', 'Other')),
ADD COLUMN IF NOT EXISTS team text CHECK (team IN ('Student Engagement', 'Parent Communication')),
ADD COLUMN IF NOT EXISTS content_type text DEFAULT 'Plain Text' CHECK (content_type IN ('Markdown', 'Plain Text')),
ADD COLUMN IF NOT EXISTS link text;
