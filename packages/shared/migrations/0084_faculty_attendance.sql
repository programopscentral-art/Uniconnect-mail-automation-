-- Faculty Attendance & Workload Management
-- Uses the existing faculty_profiles table as the instructor master.
-- Adds attendance tracking + daily workload logs.
-- Data auto-reflects in the ops dashboard and reports.

-- 1. If instructor_profiles was already created (from a prior run), keep it
--    as a fallback. New deployments use faculty_profiles directly.
CREATE TABLE IF NOT EXISTS instructor_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    faculty_profile_id uuid,  -- links to faculty_profiles if exists
    name text NOT NULL,
    email text,
    phone text,
    designation text,
    department text,
    subjects text[] DEFAULT '{}',
    is_active boolean NOT NULL DEFAULT true,
    created_by uuid REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_instructor_profiles_university ON instructor_profiles(university_id);
CREATE INDEX IF NOT EXISTS idx_instructor_profiles_active ON instructor_profiles(university_id, is_active);
CREATE INDEX IF NOT EXISTS idx_instructor_profiles_faculty ON instructor_profiles(faculty_profile_id);

-- Add faculty_profile_id column if table already existed without it
DO $$ BEGIN
    ALTER TABLE instructor_profiles ADD COLUMN IF NOT EXISTS faculty_profile_id uuid;
EXCEPTION WHEN others THEN NULL;
END $$;

-- 2. Daily attendance (one row per instructor per day)
CREATE TABLE IF NOT EXISTS instructor_attendance (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    instructor_id uuid NOT NULL REFERENCES instructor_profiles(id) ON DELETE CASCADE,
    university_id uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    date date NOT NULL,
    status text NOT NULL DEFAULT 'present',
    marked_by uuid NOT NULL REFERENCES users(id),
    marked_at timestamptz NOT NULL DEFAULT now(),
    notes text,
    UNIQUE(instructor_id, date)
);

CREATE INDEX IF NOT EXISTS idx_instructor_attendance_date ON instructor_attendance(university_id, date);
CREATE INDEX IF NOT EXISTS idx_instructor_attendance_instructor ON instructor_attendance(instructor_id, date);

-- 3. Daily workload log
CREATE TABLE IF NOT EXISTS instructor_daily_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    instructor_id uuid NOT NULL REFERENCES instructor_profiles(id) ON DELETE CASCADE,
    university_id uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    date date NOT NULL,
    sessions_taken int NOT NULL DEFAULT 0,
    subjects_taught text[] DEFAULT '{}',
    topics_covered text,
    workload_notes text,
    logged_by uuid NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(instructor_id, date)
);

CREATE INDEX IF NOT EXISTS idx_instructor_daily_log_date ON instructor_daily_log(university_id, date);

-- 4. Auto-sync: if faculty_profiles table exists, create instructor_profiles
--    records for any faculty who don't have one yet. This runs once on deploy
--    and ensures the attendance system sees all existing faculty.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'faculty_profiles') THEN
        INSERT INTO instructor_profiles (university_id, user_id, faculty_profile_id, name, email, designation, department, is_active)
        SELECT
            fp.university_id,
            fp.user_id,
            fp.id,
            COALESCE(u.name, fp.employee_code, 'Unknown'),
            u.email,
            fp.designation,
            fp.department,
            fp.employment_status = 'active'
        FROM faculty_profiles fp
        LEFT JOIN users u ON u.id = fp.user_id
        WHERE NOT EXISTS (
            SELECT 1 FROM instructor_profiles ip WHERE ip.faculty_profile_id = fp.id
        )
        ON CONFLICT DO NOTHING;
    END IF;
END $$;
