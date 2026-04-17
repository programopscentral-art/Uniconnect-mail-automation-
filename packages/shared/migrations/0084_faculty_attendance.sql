-- Faculty Attendance & Workload Management
-- Creates instructor tracking tables and syncs existing faculty users.

CREATE TABLE IF NOT EXISTS instructor_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
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

-- Auto-sync existing faculty users into instructor_profiles
INSERT INTO instructor_profiles (university_id, user_id, name, email, designation, is_active)
SELECT DISTINCT
    u.university_id, u.id, u.name, u.email, 'Faculty', u.is_active
FROM users u
WHERE u.university_id IS NOT NULL AND u.is_active = true
  AND (u.role = 'FACULTY' OR EXISTS (
      SELECT 1 FROM user_role_assignments ura WHERE ura.user_id = u.id AND ura.role_code = 'faculty'
  ))
  AND NOT EXISTS (SELECT 1 FROM instructor_profiles ip WHERE ip.user_id = u.id)
ON CONFLICT DO NOTHING;
