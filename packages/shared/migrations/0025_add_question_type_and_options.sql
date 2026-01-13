-- Add type and options columns to assessment_questions
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'NORMAL';
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS options JSONB;

-- Update existing questions to have 'NORMAL' type if NULL (though DEFAULT handles it for new ones)
UPDATE assessment_questions SET type = 'NORMAL' WHERE type IS NULL;
