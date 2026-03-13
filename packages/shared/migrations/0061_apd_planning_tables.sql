-- APD (Academic Planning Document) tables for timetable scheduling system
-- These store university-level planning constraints that drive timetable generation.

-- 1. APD Import Batches — track each APD file upload
CREATE TABLE IF NOT EXISTS apd_import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_size_bytes INTEGER,
    row_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    import_status TEXT DEFAULT 'PENDING' CHECK (import_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    error_details JSONB DEFAULT '[]'::jsonb,
    uploaded_by UUID REFERENCES users(id),
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. APD University Plans — per-university scheduling constraints for a term
CREATE TABLE IF NOT EXISTS apd_university_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    import_batch_id UUID REFERENCES apd_import_batches(id) ON DELETE SET NULL,
    term_id UUID REFERENCES terms(id) ON DELETE SET NULL,
    program_id UUID REFERENCES programs(id) ON DELETE SET NULL,

    -- Date boundaries
    start_date DATE,
    end_date DATE,

    -- Working day rules
    working_days_per_week INTEGER DEFAULT 5,
    total_working_days INTEGER,
    saturdays_off TEXT DEFAULT 'ALL', -- ALL, ALTERNATE, NONE, CUSTOM
    non_working_saturdays JSONB DEFAULT '[]'::jsonb,  -- list of specific dates
    public_holidays JSONB DEFAULT '[]'::jsonb,         -- [{date, name}]

    -- Slot structure
    slots_per_day INTEGER DEFAULT 7,
    slot_duration_minutes INTEGER DEFAULT 50,

    -- Capacity calculations
    total_university_working_days INTEGER,
    university_assessment_days INTEGER DEFAULT 0,
    niat_working_days INTEGER,
    total_niat_slots INTEGER,
    niat_assessment_slots INTEGER DEFAULT 0,
    net_executional_slots INTEGER,
    buffer_slots INTEGER DEFAULT 0,

    -- Signoff
    pm_signoff BOOLEAN DEFAULT FALSE,
    boa_signoff BOOLEAN DEFAULT FALSE,
    remarks TEXT,

    -- Status
    plan_status TEXT DEFAULT 'DRAFT' CHECK (plan_status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),

    UNIQUE(university_id, term_id, program_id)
);

-- 3. APD Subject Slot Requirements — per-subject slot targets within a plan
CREATE TABLE IF NOT EXISTS apd_subject_slot_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    apd_plan_id UUID NOT NULL REFERENCES apd_university_plans(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,

    -- Parsed identifiers (for matching before subject_id is resolved)
    subject_code TEXT,
    subject_name TEXT,

    -- Slot targets
    total_slots_required INTEGER NOT NULL DEFAULT 0,
    slots_per_week INTEGER NOT NULL DEFAULT 0,
    buffer_slots INTEGER DEFAULT 0,
    lab_slots_required INTEGER DEFAULT 0,
    lab_slots_per_week INTEGER DEFAULT 0,

    -- Tracking
    slots_allocated INTEGER DEFAULT 0,
    slots_remaining INTEGER GENERATED ALWAYS AS (total_slots_required - slots_allocated) STORED,

    priority INTEGER DEFAULT 1,
    remarks TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Scheduling Constraints — university-specific rules
CREATE TABLE IF NOT EXISTS scheduling_constraints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    constraint_type TEXT NOT NULL, -- MAX_FACULTY_LOAD, BLOCKED_SLOT, PREFERRED_SLOT, CONSECUTIVE_LIMIT, etc.
    constraint_scope TEXT DEFAULT 'UNIVERSITY', -- UNIVERSITY, PROGRAM, SECTION, FACULTY
    scope_entity_id UUID, -- optional reference to program/section/faculty
    constraint_value JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

-- 5. Timetable Weeks — track week-wise timetable lifecycle
CREATE TABLE IF NOT EXISTS timetable_weeks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    apd_plan_id UUID REFERENCES apd_university_plans(id) ON DELETE SET NULL,
    timetable_version_id UUID REFERENCES timetable_versions(id) ON DELETE SET NULL,
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    week_number INTEGER,
    week_status TEXT DEFAULT 'DRAFT' CHECK (week_status IN ('DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED')),
    generation_source TEXT DEFAULT 'IMPORT', -- IMPORT, GENERATED, CLONE, MANUAL
    cloned_from_week_id UUID REFERENCES timetable_weeks(id),
    published_at TIMESTAMPTZ,
    published_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(university_id, week_start, week_end)
);

-- 6. Timetable Import Batches — track each timetable file import
CREATE TABLE IF NOT EXISTS timetable_import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    timetable_version_id UUID REFERENCES timetable_versions(id) ON DELETE SET NULL,
    timetable_week_id UUID REFERENCES timetable_weeks(id) ON DELETE SET NULL,
    file_name TEXT NOT NULL,
    file_size_bytes INTEGER,
    total_rows_parsed INTEGER DEFAULT 0,
    rows_matched INTEGER DEFAULT 0,
    rows_failed INTEGER DEFAULT 0,
    error_details JSONB DEFAULT '[]'::jsonb,
    import_status TEXT DEFAULT 'PENDING' CHECK (import_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED')),
    uploaded_by UUID REFERENCES users(id),
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Timetable Change Logs — version-to-version diffs
CREATE TABLE IF NOT EXISTS timetable_change_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    from_version_id UUID REFERENCES timetable_versions(id) ON DELETE SET NULL,
    to_version_id UUID REFERENCES timetable_versions(id) ON DELETE SET NULL,
    timetable_week_id UUID REFERENCES timetable_weeks(id) ON DELETE SET NULL,
    change_type TEXT NOT NULL, -- FACULTY_CHANGED, SLOT_CHANGED, SESSION_ADDED, SESSION_REMOVED, SUBJECT_CHANGED
    session_id UUID REFERENCES timetable_sessions(id) ON DELETE SET NULL,
    old_values JSONB DEFAULT '{}'::jsonb,
    new_values JSONB DEFAULT '{}'::jsonb,
    change_reason TEXT,
    changed_by UUID REFERENCES users(id),
    changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_apd_plans_university ON apd_university_plans(university_id);
CREATE INDEX IF NOT EXISTS idx_apd_plans_term ON apd_university_plans(term_id);
CREATE INDEX IF NOT EXISTS idx_apd_subject_slots_plan ON apd_subject_slot_requirements(apd_plan_id);
CREATE INDEX IF NOT EXISTS idx_scheduling_constraints_university ON scheduling_constraints(university_id, constraint_type);
CREATE INDEX IF NOT EXISTS idx_timetable_weeks_university ON timetable_weeks(university_id, week_start);
CREATE INDEX IF NOT EXISTS idx_timetable_import_batches_university ON timetable_import_batches(university_id);
CREATE INDEX IF NOT EXISTS idx_timetable_change_logs_version ON timetable_change_logs(to_version_id);
