-- UNI-CONNECT: ACADEMIC OPERATIONS MIGRATION PLAN
-- DATE: 2026-03-09
-- STATUS: DRAFT

-- =============================================================================
-- PHASE 1: CORE SHARED ENTITIES & RBAC
-- =============================================================================

-- 1.1 EXTEND UNIVERSITIES
ALTER TABLE universities 
ADD COLUMN IF NOT EXISTS short_code TEXT,
ADD COLUMN IF NOT EXISTS type TEXT CHECK (type IN ('FEDERAL','STATE','PRIVATE','DEEMED')),
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC',
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ACTIVE',
ADD COLUMN IF NOT EXISTS metadata_json JSONB DEFAULT '{}'::jsonb;

-- 1.2 CAMPUSES
CREATE TABLE IF NOT EXISTS campuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    address TEXT,
    status TEXT DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT TRUE,
    metadata_json JSONB DEFAULT '{}'::jsonb,
    UNIQUE(university_id, code)
);

-- 1.3 PROGRAMS
CREATE TABLE IF NOT EXISTS programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    campus_id UUID REFERENCES campuses(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    degree_type TEXT,
    semester_count INTEGER,
    status TEXT DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    metadata_json JSONB DEFAULT '{}'::jsonb,
    UNIQUE(university_id, code)
);

-- 1.4 TERMS / SEMESTERS
CREATE TABLE IF NOT EXISTS terms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    metadata_json JSONB DEFAULT '{}'::jsonb
);

-- 1.5 SECTIONS / BATCHES
CREATE TABLE IF NOT EXISTS sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    term_id UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    batch_code TEXT NOT NULL,
    strength INTEGER,
    status TEXT DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    metadata_json JSONB DEFAULT '{}'::jsonb,
    UNIQUE(university_id, batch_code)
);

-- 1.6 SUBJECTS
CREATE TABLE IF NOT EXISTS subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    term_id UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    credit_value NUMERIC(4,2),
    total_sessions_required INTEGER,
    exam_type_config_json JSONB DEFAULT '{}'::jsonb,
    status TEXT DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    metadata_json JSONB DEFAULT '{}'::jsonb,
    UNIQUE(university_id, code)
);

-- 1.7 CLASSROOMS
CREATE TABLE IF NOT EXISTS classrooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    campus_id UUID NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    room_type TEXT, -- LECTURE, LAB, HALL
    capacity INTEGER,
    floor INTEGER,
    status TEXT DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    metadata_json JSONB DEFAULT '{}'::jsonb,
    UNIQUE(university_id, campus_id, code)
);

-- 1.8 ROLES & USER ROLE ASSIGNMENTS
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_role_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    campus_id UUID REFERENCES campuses(id) ON DELETE SET NULL,
    program_id UUID REFERENCES programs(id) ON DELETE SET NULL,
    section_id UUID REFERENCES sections(id) ON DELETE SET NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    UNIQUE(user_id, role_id, university_id, campus_id, program_id, section_id)
);

-- SEED ROLES
INSERT INTO roles (name, code, description) VALUES
('Program Ops Admin', 'program_ops_admin', 'Full operational control over a university'),
('Faculty', 'faculty', 'Standard faculty access'),
('Student', 'student', 'Standard student access'),
('Support Staff', 'support_staff', 'Ticketing and escalation management'),
('Stakeholder', 'stakeholder', 'Read-only operational reporting access'),
('Finance Ops', 'finance_ops', 'Manage budget, fees, and payments'),
('Exam Ops', 'exam_ops', 'Manage exam plans, seating and marks')
ON CONFLICT (code) DO NOTHING;

-- BACKFILL EXISTING USERS INTO RBAC SYSTEM
-- Map legacy role 'ADMIN' to 'program_ops_admin' and 'UNIVERSITY_OPERATOR' to 'support_staff' or custom mapping
INSERT INTO user_role_assignments (user_id, role_id, university_id, is_primary)
SELECT 
    u.id as user_id, 
    r.id as role_id, 
    u.university_id, 
    TRUE as is_primary
FROM users u
JOIN roles r ON (
    CASE 
        WHEN u.role = 'ADMIN' THEN r.code = 'program_ops_admin'
        WHEN u.role = 'UNIVERSITY_OPERATOR' THEN r.code = 'support_staff'
        ELSE FALSE
    END
)
WHERE u.university_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- =============================================================================
-- PHASE 2: FACULTY & STUDENT DOMAIN
-- =============================================================================

-- 2.1 FACULTY PROFILES
CREATE TABLE IF NOT EXISTS faculty_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    employee_code TEXT NOT NULL,
    department TEXT,
    specialization TEXT,
    designation TEXT,
    joining_date DATE,
    employment_status TEXT DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    metadata_json JSONB DEFAULT '{}'::jsonb,
    UNIQUE(university_id, employee_code)
);

-- 2.2 STUDENT PROFILES
CREATE TABLE IF NOT EXISTS student_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    program_id UUID REFERENCES programs(id) ON DELETE SET NULL,
    term_id UUID REFERENCES terms(id) ON DELETE SET NULL,
    section_id UUID REFERENCES sections(id) ON DELETE SET NULL,
    enrollment_number TEXT NOT NULL,
    admission_date DATE,
    student_status TEXT DEFAULT 'ENROLLED',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    metadata_json JSONB DEFAULT '{}'::jsonb,
    UNIQUE(university_id, enrollment_number)
);

-- 2.3 FACULTY SUBJECT MAPPINGS
CREATE TABLE IF NOT EXISTS faculty_subject_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    faculty_profile_id UUID NOT NULL REFERENCES faculty_profiles(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    priority_level INTEGER DEFAULT 1,
    can_substitute BOOLEAN DEFAULT FALSE,
    preferred_section_id UUID REFERENCES sections(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.4 FACULTY AVAILABILITY
CREATE TABLE IF NOT EXISTS faculty_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    faculty_profile_id UUID NOT NULL REFERENCES faculty_profiles(id) ON DELETE CASCADE,
    day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
    slot_start TIME NOT NULL,
    slot_end TIME NOT NULL,
    availability_type TEXT DEFAULT 'AVAILABLE', -- AVAILABLE, BUSY
    mode_preference TEXT DEFAULT 'PHYSICAL', -- PHYSICAL, ONLINE, HYBRID
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.5 FACULTY LEAVE REQUESTS
CREATE TABLE IF NOT EXISTS faculty_leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    faculty_profile_id UUID NOT NULL REFERENCES faculty_profiles(id) ON DELETE CASCADE,
    leave_date DATE NOT NULL,
    leave_type TEXT, -- SICK, PERSONAL, PROFESSIONAL
    reason TEXT,
    approval_status TEXT DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- PHASE 3: SCHEDULING DOMAIN
-- =============================================================================

-- 3.1 TIMETABLE VERSIONS
CREATE TABLE IF NOT EXISTS timetable_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    term_id UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
    section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    version_status TEXT DEFAULT 'DRAFT', -- DRAFT, PUBLISHED, ARCHIVED
    effective_from DATE,
    published_at TIMESTAMPTZ,
    published_by UUID REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.2 TIMETABLE SESSIONS
CREATE TABLE IF NOT EXISTS timetable_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timetable_version_id UUID NOT NULL REFERENCES timetable_versions(id) ON DELETE CASCADE,
    university_id UUID NOT NULL REFERENCES universities(id),
    program_id UUID NOT NULL REFERENCES programs(id),
    term_id UUID NOT NULL REFERENCES terms(id),
    section_id UUID NOT NULL REFERENCES sections(id),
    subject_id UUID NOT NULL REFERENCES subjects(id),
    faculty_profile_id UUID NOT NULL REFERENCES faculty_profiles(id),
    classroom_id UUID NOT NULL REFERENCES classrooms(id),
    session_date DATE NOT NULL,
    slot_start TIME NOT NULL,
    slot_end TIME NOT NULL,
    delivery_mode TEXT DEFAULT 'PHYSICAL',
    planned_topic TEXT,
    planned_sequence_no INTEGER,
    session_status TEXT DEFAULT 'SCHEDULED', -- SCHEDULED, RESCHEDULED, CANCELLED, COMPLETED, MISSED
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.3 SESSION EXECUTION LOGS
CREATE TABLE IF NOT EXISTS session_execution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timetable_session_id UUID NOT NULL REFERENCES timetable_sessions(id) ON DELETE CASCADE,
    actual_faculty_profile_id UUID REFERENCES faculty_profiles(id),
    actual_classroom_id UUID REFERENCES classrooms(id),
    actual_start_time TIMESTAMPTZ,
    actual_end_time TIMESTAMPTZ,
    execution_status TEXT DEFAULT 'COMPLETED', -- COMPLETED, MISSED, PARTIAL, CANCELLED
    completion_notes TEXT,
    marked_by UUID REFERENCES users(id),
    marked_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.4 SESSION CHANGE LOGS
CREATE TABLE IF NOT EXISTS session_change_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timetable_session_id UUID NOT NULL REFERENCES timetable_sessions(id) ON DELETE CASCADE,
    change_type TEXT NOT NULL, -- FACULTY_CHANGED, ROOM_CHANGED, TIME_CHANGED, CANCELLED, RESCHEDULED
    old_snapshot_json JSONB,
    new_snapshot_json JSONB,
    reason TEXT,
    changed_by UUID REFERENCES users(id),
    changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.5 SCHEDULING CONFLICTS
CREATE TABLE IF NOT EXISTS scheduling_conflicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timetable_session_id UUID NOT NULL REFERENCES timetable_sessions(id) ON DELETE CASCADE,
    conflict_type TEXT NOT NULL, -- FACULTY_CLASH, ROOM_CLASH, SECTION_CLASH, CAPACITY_ISSUE, AVAILABILITY_ISSUE
    conflict_severity TEXT DEFAULT 'HIGH', -- LOW, MEDIUM, HIGH, CRITICAL
    related_entity_type TEXT,
    related_entity_id UUID,
    description TEXT,
    resolution_status TEXT DEFAULT 'OPEN', -- OPEN, RESOLVED, IGNORED
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.6 SYLLABUS TRACKING
CREATE TABLE IF NOT EXISTS syllabus_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    total_sessions_required INTEGER,
    total_sessions_completed INTEGER DEFAULT 0,
    total_sessions_missed INTEGER DEFAULT 0,
    completion_percentage NUMERIC(5,2) DEFAULT 0.0,
    risk_status TEXT DEFAULT 'ON_TRACK', -- ON_TRACK, AT_RISK, CRITICAL
    last_updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- PHASE 4: EXAMINATION DOMAIN
-- =============================================================================

-- 4.1 EXAM PLANS
CREATE TABLE IF NOT EXISTS exam_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    term_id UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
    exam_name TEXT NOT NULL,
    exam_type TEXT NOT NULL, -- INTERNAL, SEMESTER_END, BACKLOG
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    version_status TEXT DEFAULT 'DRAFT',
    published_at TIMESTAMPTZ,
    published_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4.2 EXAMS (SCHEDULE)
CREATE TABLE IF NOT EXISTS exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_plan_id UUID NOT NULL REFERENCES exam_plans(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects(id),
    section_id UUID NOT NULL REFERENCES sections(id),
    exam_date DATE NOT NULL,
    slot_start TIME NOT NULL,
    slot_end TIME NOT NULL,
    classroom_id UUID NOT NULL REFERENCES classrooms(id),
    exam_mode TEXT DEFAULT 'PHYSICAL',
    exam_status TEXT DEFAULT 'SCHEDULED', -- SCHEDULED, COMPLETED, CANCELLED
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4.3 INVIGILATION ASSIGNMENTS
CREATE TABLE IF NOT EXISTS invigilation_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    faculty_profile_id UUID NOT NULL REFERENCES faculty_profiles(id),
    assignment_status TEXT DEFAULT 'ASSIGNED',
    assigned_by UUID REFERENCES users(id),
    assigned_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4.4 EXAM SEATING PLANS
CREATE TABLE IF NOT EXISTS exam_seating_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    classroom_id UUID NOT NULL REFERENCES classrooms(id),
    seating_version INTEGER DEFAULT 1,
    seating_data_json JSONB NOT NULL,
    generated_by UUID REFERENCES users(id),
    generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4.5 MARKS UPLOAD BATCHES
CREATE TABLE IF NOT EXISTS marks_upload_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES users(id),
    upload_source TEXT, -- EXCEL, DIRECT_ENTRY, API
    upload_status TEXT DEFAULT 'PENDING', -- PENDING, VALIDATED, FAILED, COMMITTED
    validation_summary_json JSONB DEFAULT '{}'::jsonb,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4.6 STUDENT EXAM MARKS
CREATE TABLE IF NOT EXISTS student_exam_marks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    student_profile_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
    raw_marks NUMERIC(6,2),
    moderated_marks NUMERIC(6,2),
    final_marks NUMERIC(6,2),
    marks_status TEXT DEFAULT 'DRAFT', -- DRAFT, SUBMITTED, PUBLISHED
    entered_by UUID REFERENCES users(id),
    entered_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(exam_id, student_profile_id)
);

-- 4.7 RESULT PUBLICATION LOGS
CREATE TABLE IF NOT EXISTS result_publication_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_plan_id UUID NOT NULL REFERENCES exam_plans(id) ON DELETE CASCADE,
    publication_status TEXT DEFAULT 'PUBLISHED',
    published_by UUID REFERENCES users(id),
    published_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT
);

-- =============================================================================
-- PHASE 5: SUPPORT, NOTIFICATIONS, APPROVALS & CONFIG
-- =============================================================================

-- 5.1 SUPPORT TICKETS
CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    ticket_number SERIAL,
    requester_user_id UUID NOT NULL REFERENCES users(id),
    requester_role TEXT,
    ticket_type TEXT NOT NULL, -- ACADEMIC, TECHNICAL, EXAMINATION, PORTAL_ACCESS
    ticket_category TEXT,
    priority TEXT DEFAULT 'MEDIUM', -- LOW, MEDIUM, HIGH, URGENT
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'OPEN', -- OPEN, IN_PROGRESS, WAITING, RESOLVED, CLOSED, ESCALATED
    assigned_team TEXT,
    assigned_user_id UUID REFERENCES users(id),
    due_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    escalation_level INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata_json JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS ticket_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    comment_text TEXT NOT NULL,
    commented_by UUID NOT NULL REFERENCES users(id),
    commented_at TIMESTAMPTZ DEFAULT NOW(),
    is_internal BOOLEAN DEFAULT FALSE
);

-- 5.2 DOCUMENTS / FILES
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    owner_entity_type TEXT NOT NULL, -- FACULTY, STUDENT, TIMETABLE, EXAM, TICKET, REPORT
    owner_entity_id UUID NOT NULL,
    document_type TEXT,
    file_url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_status TEXT DEFAULT 'ACTIVE',
    uploaded_by UUID REFERENCES users(id),
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    metadata_json JSONB DEFAULT '{}'::jsonb
);

-- 5.3 NOTIFICATIONS (Extending existing notifications table)
ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS event_name TEXT,
ADD COLUMN IF NOT EXISTS target_role TEXT,
ADD COLUMN IF NOT EXISTS channel TEXT, -- IN_APP, EMAIL, WHATSAPP, TEAMS
ADD COLUMN IF NOT EXISTS payload_json JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'QUEUED', -- QUEUED, SENT, FAILED, READ
ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- Ensure required columns for new Academic Ops logic have defaults if they were missing
UPDATE notifications SET channel = 'IN_APP' WHERE channel IS NULL;
UPDATE notifications SET delivery_status = CASE WHEN is_read = TRUE THEN 'READ' ELSE 'SENT' END WHERE delivery_status = 'QUEUED';

-- 5.4 APPROVALS
CREATE TABLE IF NOT EXISTS approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_type TEXT NOT NULL, -- LEAVE_REQUEST, TIMETABLE_PUBLISH, EXAM_PUBLISH, MARKS_PUBLISH
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    requested_by UUID NOT NULL REFERENCES users(id),
    approver_user_id UUID REFERENCES users(id),
    approval_status TEXT DEFAULT 'PENDING',
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    comments TEXT
);

-- 5.5 AUDIT & LOGS
-- (Standardizing existing audit architecture)
CREATE TABLE IF NOT EXISTS domain_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    payload_json JSONB NOT NULL,
    event_status TEXT DEFAULT 'PENDING',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

-- 5.6 UNIVERSITY CONFIGURATIONS
CREATE TABLE IF NOT EXISTS university_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    config_key TEXT NOT NULL,
    config_value_json JSONB NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(university_id, config_key)
);

-- 5.7 GENERATED REPORTS
CREATE TABLE IF NOT EXISTS generated_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    report_type TEXT NOT NULL,
    report_name TEXT NOT NULL,
    report_params_json JSONB DEFAULT '{}'::jsonb,
    file_url TEXT,
    generation_status TEXT DEFAULT 'PENDING',
    generated_by UUID REFERENCES users(id),
    generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- PERFORMANCE INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_timetable_sessions_section_date ON timetable_sessions(section_id, session_date);
CREATE INDEX IF NOT EXISTS idx_timetable_sessions_faculty_date ON timetable_sessions(faculty_profile_id, session_date);
CREATE INDEX IF NOT EXISTS idx_student_profiles_section ON student_profiles(section_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_status ON notifications(user_id, delivery_status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_university_status ON support_tickets(university_id, status);
