-- Add created_by to students table for user-level isolation
ALTER TABLE students ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL;

-- Index for filtering by user imports
CREATE INDEX IF NOT EXISTS idx_students_created_by ON students(created_by);

-- Note: We don't backfill created_by as the user wants a "fresh start" for everyone.
-- Existing students will be "orphaned" or visible only to admins if we choose.
-- Based on the request, we will prioritize isolating the LOAD screen.
