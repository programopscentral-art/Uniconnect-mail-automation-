-- Add is_important column to assessment_questions
ALTER TABLE assessment_questions ADD COLUMN is_important BOOLEAN DEFAULT FALSE;
