-- Add image_url column to assessment_questions
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS image_url TEXT;
