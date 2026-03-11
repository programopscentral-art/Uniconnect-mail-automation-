-- Academic Batches: admission-year cohorts per university (e.g. "2025-2029")
-- Separate from assessment_batches which is for question-paper management.

CREATE TABLE IF NOT EXISTS academic_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    name TEXT NOT NULL,                   -- display name, e.g. "2025-2029"
    start_year INT NOT NULL,              -- admission year, e.g. 2025
    end_year INT NOT NULL,                -- graduation year, e.g. 2029
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(university_id, start_year, end_year)
);

-- Add batch_id to student_profiles
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES academic_batches(id) ON DELETE SET NULL;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_student_profiles_batch_id ON student_profiles(batch_id);
CREATE INDEX IF NOT EXISTS idx_academic_batches_university ON academic_batches(university_id);
