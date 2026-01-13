-- Add unit_id to assessment_questions and handle transition from topic-wise to unit-wise questions

ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES assessment_units(id) ON DELETE CASCADE;

-- Data Migration: If questions are linked to topics, link them to the unit of that topic
UPDATE assessment_questions q
SET unit_id = t.unit_id
FROM assessment_topics t
WHERE q.topic_id = t.id AND q.unit_id IS NULL;

-- Make topic_id nullable since we are moving towards unit-wise questions
ALTER TABLE assessment_questions ALTER COLUMN topic_id DROP NOT NULL;

-- Ensure is_important exists (it should from 0021, but for safety)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='assessment_questions' AND COLUMN_NAME='is_important') THEN
        ALTER TABLE assessment_questions ADD COLUMN is_important BOOLEAN DEFAULT FALSE;
    END IF;
END $$;
