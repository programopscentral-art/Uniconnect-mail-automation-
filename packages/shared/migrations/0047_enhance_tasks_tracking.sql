-- Migration: Enhance Tasks Tracking
-- Description: Add estimated_time, started_at, completed_at for better reporting

-- Add estimated_time to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_time VARCHAR(100);

-- Add started_at and completed_at to task_assignees to track individual work
ALTER TABLE task_assignees ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE task_assignees ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE task_assignees ADD COLUMN IF NOT EXISTS estimated_time VARCHAR(100); -- Also allow individual estimates
