-- Fix student_profiles table: add columns that were defined in 0052 but missed because
-- the table already existed from 0047 (CREATE TABLE IF NOT EXISTS did not alter it).

-- Add missing columns (safe: IF NOT EXISTS)
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS university_id UUID REFERENCES universities(id) ON DELETE CASCADE;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS enrollment_number TEXT;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS term_id UUID REFERENCES terms(id) ON DELETE SET NULL;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS student_status TEXT DEFAULT 'ENROLLED';
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS admission_date DATE;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS metadata_json JSONB DEFAULT '{}'::jsonb;

-- Allow user_id to be nullable (new import creates profiles before user sometimes)
ALTER TABLE student_profiles ALTER COLUMN user_id DROP NOT NULL;

-- Add unique constraint on (university_id, enrollment_number) if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'student_profiles_university_id_enrollment_number_key'
    ) THEN
        ALTER TABLE student_profiles ADD CONSTRAINT student_profiles_university_id_enrollment_number_key UNIQUE (university_id, enrollment_number);
    END IF;
END $$;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_student_profiles_university ON student_profiles(university_id);
CREATE INDEX IF NOT EXISTS idx_student_profiles_enrollment ON student_profiles(enrollment_number);
CREATE INDEX IF NOT EXISTS idx_student_profiles_term ON student_profiles(term_id);
CREATE INDEX IF NOT EXISTS idx_student_profiles_section ON student_profiles(section_id);
