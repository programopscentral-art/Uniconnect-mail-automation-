-- Add reminder_sent to tasks to avoid duplicate notifications
ALTER TABLE tasks ADD COLUMN reminder_sent boolean DEFAULT false;
