-- Add difficulty_levels to assessment_subjects if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assessment_subjects' AND column_name='difficulty_levels') THEN
        ALTER TABLE assessment_subjects ADD COLUMN difficulty_levels TEXT[] DEFAULT ARRAY['L1', 'L2', 'L3'];
    END IF;
END $$;

-- Change bloom_level in assessment_questions from ENUM to TEXT
DO $$
BEGIN
    -- Only proceed if the column is currently of type 'USER-DEFINED' (the enum)
    IF (SELECT data_type FROM information_schema.columns WHERE table_name='assessment_questions' AND column_name='bloom_level') = 'USER-DEFINED' THEN
        -- Drop the default if it exists
        ALTER TABLE assessment_questions ALTER COLUMN bloom_level DROP DEFAULT;

        -- Change the type to TEXT, using current value as string
        ALTER TABLE assessment_questions ALTER COLUMN bloom_level TYPE TEXT USING bloom_level::TEXT;

        -- Add back a text default
        ALTER TABLE assessment_questions ALTER COLUMN bloom_level SET DEFAULT 'L1';
    END IF;
END $$;

-- Ensure parent_topic_id exists on assessment_topics (already in 0007, but just for safety)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assessment_topics' AND column_name='parent_topic_id') THEN
        ALTER TABLE assessment_topics ADD COLUMN parent_topic_id UUID REFERENCES assessment_topics(id) ON DELETE CASCADE;
    END IF;
END $$;
