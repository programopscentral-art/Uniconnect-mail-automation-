-- Faculty Attendance & Workload Management
-- Enables BOAs (with permission) to mark daily instructor attendance
-- and log workload (subjects taught, topics covered, sessions taken).
-- Data auto-reflects in the ops dashboard Instructors card.

-- 1. Instructor profiles: faculty master per university
CREATE TABLE IF NOT EXISTS instructor_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    name text NOT NULL,
    email text,
    phone text,
    designation text,                          -- 'Assistant Professor', 'Lecturer', etc.
    department text,
    subjects text[] DEFAULT '{}',              -- ['Mathematics', 'Physics']
    is_active boolean NOT NULL DEFAULT true,
    created_by uuid REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_instructor_profiles_university ON instructor_profiles(university_id);
CREATE INDEX IF NOT EXISTS idx_instructor_profiles_active ON instructor_profiles(university_id, is_active);

-- 2. Daily attendance: one row per instructor per day
CREATE TABLE IF NOT EXISTS instructor_attendance (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    instructor_id uuid NOT NULL REFERENCES instructor_profiles(id) ON DELETE CASCADE,
    university_id uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    date date NOT NULL,
    status text NOT NULL DEFAULT 'present',    -- 'present' | 'absent' | 'training' | 'wfh' | 'leave' | 'half_day'
    marked_by uuid NOT NULL REFERENCES users(id),
    marked_at timestamptz NOT NULL DEFAULT now(),
    notes text,
    UNIQUE(instructor_id, date)
);

CREATE INDEX IF NOT EXISTS idx_instructor_attendance_date ON instructor_attendance(university_id, date);
CREATE INDEX IF NOT EXISTS idx_instructor_attendance_instructor ON instructor_attendance(instructor_id, date);

-- 3. Daily workload log: what each instructor covered today
CREATE TABLE IF NOT EXISTS instructor_daily_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    instructor_id uuid NOT NULL REFERENCES instructor_profiles(id) ON DELETE CASCADE,
    university_id uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    date date NOT NULL,
    sessions_taken int NOT NULL DEFAULT 0,
    subjects_taught text[] DEFAULT '{}',
    topics_covered text,                       -- free text: "Ch 5: Thermodynamics, problems 1-15"
    workload_notes text,                       -- extra context / issues
    logged_by uuid NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(instructor_id, date)
);

CREATE INDEX IF NOT EXISTS idx_instructor_daily_log_date ON instructor_daily_log(university_id, date);
