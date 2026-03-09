-- UNI-CONNECT: PHASE 1 PRODUCTION-GRADE OPS FOUNDATION
-- Focus: Audit, RBAC Enhancement, Timetable & Conflicts

-- 1. ENHANCED AUDIT LOGS
CREATE TABLE IF NOT EXISTS system_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL, -- e.g., 'TIMETABLE_PUBLISH', 'LEAVE_APPROVE', 'MARKS_UPLOAD'
    entity_type TEXT NOT NULL, -- e.g., 'TIMETABLE', 'SECTION', 'MARK'
    entity_id UUID,
    before_state JSONB DEFAULT '{}',
    after_state JSONB DEFAULT '{}',
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_university ON system_activity_logs(university_id, action_type);
CREATE INDEX IF NOT EXISTS idx_activity_actor ON system_activity_logs(actor_id);

-- 2. UNIVERSITY MASTER SLOTS (FOR SLOT VIOLATION DETECTION)
CREATE TABLE IF NOT EXISTS university_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- e.g. 'Slot 1'
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    slot_type TEXT DEFAULT 'LECTURE', -- LECTURE, BREAK, LAB
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(university_id, start_time, end_time)
);

-- 3. ENHANCED TIMETABLE VERSIONING (DRAFT SUPPORT)
-- We extend the existing timetable tables or ensure they support the 3-source input
ALTER TABLE timetable_versions 
ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'UPLOAD', -- UPLOAD, MANUAL, CLONE
ADD COLUMN IF NOT EXISTS source_metadata JSONB DEFAULT '{}'; -- File info or clone source ID

-- 4. ENHANCED CONFLICTS
ALTER TABLE scheduling_conflicts
ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS resolver_id UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS resolution_note TEXT;

-- 5. UNIVERSITY CONFIG FOR NOTIFICATIONS
CREATE TABLE IF NOT EXISTS university_notification_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- e.g., 'TIMETABLE_PUBLISH'
    is_email_enabled BOOLEAN DEFAULT TRUE,
    is_in_app_enabled BOOLEAN DEFAULT TRUE,
    is_whatsapp_enabled BOOLEAN DEFAULT FALSE,
    custom_template TEXT,
    UNIQUE(university_id, event_type)
);

-- 6. FACULTY LEAVE REQUESTS - WIRING TO SCHEDULING
CREATE TABLE IF NOT EXISTS faculty_leave_impacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    leave_id UUID NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES timetable_sessions(id) ON DELETE CASCADE,
    impact_status TEXT DEFAULT 'PENDING_SUBSTITUTION', -- PENDING, RESOLVED, CANCELLED
    suggested_substitute_id UUID REFERENCES faculty_profiles(id),
    resolution_type TEXT, -- SUBSTITUTION, RESCHEDULED, CANCELLED
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SEEDING BASIC RBAC ROLES IF MISSING
INSERT INTO roles (name, code, description) VALUES 
('Program Ops Admin', 'PROGRAM_OPS_ADMIN', 'Central control for university operations'),
('Faculty', 'FACULTY', 'Personalized teaching and exam management'),
('Support Staff', 'SUPPORT_STAFF', 'Ops support and ticket resolution'),
('Dean / COE', 'DEAN_COE', 'High-level auditing and approval-based oversight')
ON CONFLICT (code) DO NOTHING;
