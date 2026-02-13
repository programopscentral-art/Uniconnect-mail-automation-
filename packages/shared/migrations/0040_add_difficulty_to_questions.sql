-- Add difficulty column to assessment_questions
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT 'MEDIUM';
