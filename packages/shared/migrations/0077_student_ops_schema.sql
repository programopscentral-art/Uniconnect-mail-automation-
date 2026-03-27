-- Move student-ops DDL from runtime to migration for faster page loads
CREATE TABLE IF NOT EXISTS academic_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    start_year INT NOT NULL,
    end_year INT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(university_id, start_year, end_year)
);

ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES academic_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sp_university_id ON student_profiles(university_id);
CREATE INDEX IF NOT EXISTS idx_sp_program_id ON student_profiles(program_id);
CREATE INDEX IF NOT EXISTS idx_sp_term_id ON student_profiles(term_id);
CREATE INDEX IF NOT EXISTS idx_sp_section_id ON student_profiles(section_id);
CREATE INDEX IF NOT EXISTS idx_sp_batch_id ON student_profiles(batch_id);
CREATE INDEX IF NOT EXISTS idx_sp_user_id ON student_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_sp_enrollment ON student_profiles(enrollment_number);

-- Composite index for the main roster query
CREATE INDEX IF NOT EXISTS idx_sp_univ_program_enrollment
    ON student_profiles(university_id, program_id, enrollment_number);

-- Index for user name search
CREATE INDEX IF NOT EXISTS idx_users_name_trgm ON users USING btree(name);
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(lower(email));
