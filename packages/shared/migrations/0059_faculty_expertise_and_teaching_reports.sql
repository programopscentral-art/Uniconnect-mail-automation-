-- 1. Faculty known subjects (expertise / can-teach list, separate from current assignments)
CREATE TABLE IF NOT EXISTS faculty_known_subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    faculty_profile_id UUID NOT NULL REFERENCES faculty_profiles(id) ON DELETE CASCADE,
    subject_name TEXT NOT NULL,
    proficiency_level TEXT DEFAULT 'PROFICIENT' CHECK (proficiency_level IN ('BASIC', 'PROFICIENT', 'EXPERT')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(faculty_profile_id, subject_name)
);

-- 2. Daily teaching reports (faculty submit what they taught each day)
CREATE TABLE IF NOT EXISTS faculty_teaching_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    faculty_profile_id UUID NOT NULL REFERENCES faculty_profiles(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
    section_id UUID REFERENCES sections(id) ON DELETE SET NULL,
    report_date DATE NOT NULL DEFAULT CURRENT_DATE,
    topic_name TEXT NOT NULL,
    topic_status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (topic_status IN ('COMPLETED', 'PARTIAL', 'INTRODUCED')),
    portion_percentage NUMERIC(5,2) DEFAULT 100,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Subject syllabus topics (define expected topics per subject for tracking)
CREATE TABLE IF NOT EXISTS subject_syllabus_topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    topic_name TEXT NOT NULL,
    topic_order INTEGER DEFAULT 0,
    estimated_sessions INTEGER DEFAULT 1,
    is_completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    completed_by UUID REFERENCES faculty_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(subject_id, topic_name)
);

-- 4. Enhance student_marks table if it exists — add total_marks column
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'student_marks') THEN
        ALTER TABLE student_marks ADD COLUMN IF NOT EXISTS total_marks NUMERIC(6,2);
        ALTER TABLE student_marks ADD COLUMN IF NOT EXISTS external_id TEXT;
    END IF;
END $$;
