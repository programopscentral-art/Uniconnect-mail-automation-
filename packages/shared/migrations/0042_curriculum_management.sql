-- Curriculum Management Schema

-- 1. Curriculum Imports
CREATE TABLE IF NOT EXISTS curriculum_imports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    source_filename TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'parsed', -- parsed, saved, failed
    notes_json JSONB DEFAULT '{}'::jsonb
);

-- 2. Semester Courses
CREATE TABLE IF NOT EXISTS curr_semester_courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    semester_course_id UUID NOT NULL, -- The UUIDv4 for external systems
    import_id UUID NOT NULL REFERENCES curriculum_imports(id) ON DELETE CASCADE,
    subject_name TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    semester_name TEXT,
    category TEXT,
    sub_category TEXT,
    source_code TEXT,
    credits INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Sessions
CREATE TABLE IF NOT EXISTS curr_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL, -- The UUIDv4 for external systems
    import_id UUID NOT NULL REFERENCES curriculum_imports(id) ON DELETE CASCADE,
    semester_course_id UUID NOT NULL REFERENCES curr_semester_courses(id) ON DELETE CASCADE,
    slot_number INTEGER NOT NULL,
    session_name TEXT NOT NULL,
    session_plan_name TEXT,
    session_type TEXT, -- LECTURE, PRACTICE, EXAM
    duration_in_seconds INTEGER,
    session_enum TEXT,
    unit_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Session Resources
CREATE TABLE IF NOT EXISTS curr_session_resources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id_ref UUID NOT NULL REFERENCES curr_sessions(id) ON DELETE CASCADE,
    session_id_external UUID NOT NULL, -- Matches session_id in curr_sessions
    resource_type TEXT NOT NULL, -- UNIT_LINK, PPT_LINK, OTHER
    title TEXT NOT NULL,
    resource_url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Semester Course Sessions (Mapping)
CREATE TABLE IF NOT EXISTS curr_semester_course_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    semester_course_id_ref UUID NOT NULL REFERENCES curr_semester_courses(id) ON DELETE CASCADE,
    session_id_ref UUID NOT NULL REFERENCES curr_sessions(id) ON DELETE CASCADE,
    semester_course_id_external UUID NOT NULL,
    session_id_external UUID NOT NULL,
    sort_order INTEGER NOT NULL,
    week_count INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_curr_sem_courses_import ON curr_semester_courses(import_id);
CREATE INDEX IF NOT EXISTS idx_curr_sessions_course ON curr_sessions(semester_course_id);
CREATE INDEX IF NOT EXISTS idx_curr_resources_session ON curr_session_resources(session_id_ref);
CREATE INDEX IF NOT EXISTS idx_curr_mapping_course ON curr_semester_course_sessions(semester_course_id_ref);
