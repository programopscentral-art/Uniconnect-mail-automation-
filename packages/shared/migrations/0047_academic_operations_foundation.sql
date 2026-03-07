-- Academic Operations Foundation

-- Update User Roles check constraint to include new roles
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (
    'ADMIN', 'PROGRAM_OPS', 'UNIVERSITY_OPERATOR', 'COS', 'PM', 'PMA', 'BOA', 
    'CMA', 'CMA_MANAGER', 'SET_REVIEWER', 'PROPOSER',
    'FACULTY', 'STUDENT', 'STAKEHOLDER', 'SUPPORT'
));

-- Programs
CREATE TABLE IF NOT EXISTS programs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    name text NOT NULL,
    code text NOT NULL,
    description text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(university_id, code)
);

-- Academic Years / Semesters
CREATE TABLE IF NOT EXISTS academic_periods (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    name text NOT NULL, -- e.g. "AY 2024-25", "Semester 1"
    start_date date NOT NULL,
    end_date date NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Subjects
CREATE TABLE IF NOT EXISTS subjects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id uuid REFERENCES programs(id) ON DELETE CASCADE,
    name text NOT NULL,
    code text NOT NULL,
    credits int DEFAULT 0,
    total_sessions_required int DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(program_id, code)
);

-- Sections
CREATE TABLE IF NOT EXISTS sections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    name text NOT NULL, -- e.g. "Section A"
    academic_period_id uuid REFERENCES academic_periods(id) ON DELETE SET NULL,
    capacity int DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(program_id, name, academic_period_id)
);

-- Classrooms
CREATE TABLE IF NOT EXISTS classrooms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    name text NOT NULL,
    building text,
    floor text,
    capacity int DEFAULT 0,
    amenities jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(university_id, name)
);

-- Faculty Profiles (extends Users)
CREATE TABLE IF NOT EXISTS faculty_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    employee_id text UNIQUE,
    designation text,
    department text,
    specialization text[],
    availability_config jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Student Profiles (extends Users)
CREATE TABLE IF NOT EXISTS student_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    roll_number text UNIQUE,
    program_id uuid REFERENCES programs(id) ON DELETE SET NULL,
    section_id uuid REFERENCES sections(id) ON DELETE SET NULL,
    current_semester int,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Academic Sessions (The actual classes/labs)
CREATE TABLE IF NOT EXISTS academic_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    faculty_id uuid REFERENCES faculty_profiles(id) ON DELETE SET NULL,
    section_id uuid NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    classroom_id uuid REFERENCES classrooms(id) ON DELETE SET NULL,
    start_time timestamptz NOT NULL,
    end_time timestamptz NOT NULL,
    status text NOT NULL CHECK (status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'MISSED', 'RESCHEDULED', 'CANCELLED')) DEFAULT 'SCHEDULED',
    session_type text NOT NULL CHECK (session_type IN ('LECTURE', 'LAB', 'EXAM', 'WORKSHOP')) DEFAULT 'LECTURE',
    version int DEFAULT 1,
    parent_session_id uuid REFERENCES academic_sessions(id) ON DELETE CASCADE, -- For history tracking
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Attendance
CREATE TABLE IF NOT EXISTS attendance (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
    status text NOT NULL CHECK (status IN ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED')) DEFAULT 'ABSENT',
    marked_at timestamptz DEFAULT now(),
    marked_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(session_id, student_id)
);

-- Tickets & Support
CREATE TABLE IF NOT EXISTS support_tickets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_to_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    title text NOT NULL,
    description text NOT NULL,
    category text NOT NULL, -- ACADEMIC, TECHNICAL, PORTAL, INFRA, EXAM
    priority text NOT NULL CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')) DEFAULT 'MEDIUM',
    status text NOT NULL CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'ESCALATED')) DEFAULT 'OPEN',
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Comments / Activity History
CREATE TABLE IF NOT EXISTS entity_activities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type text NOT NULL, -- support_tickets, academic_sessions, etc.
    entity_id uuid NOT NULL,
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    activity_type text NOT NULL, -- COMMENT, STATUS_CHANGE, ASSIGNMENT, etc.
    content text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
);

-- Attachments / Documents
CREATE TABLE IF NOT EXISTS attachments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    file_name text NOT NULL,
    file_path text NOT NULL,
    file_type text,
    file_size int,
    uploaded_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now()
);

-- Triggers for updated_at
DO $$ 
DECLARE
    t text;
BEGIN
    FOR t IN SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('programs', 'academic_periods', 'subjects', 'sections', 'classrooms', 'faculty_profiles', 'student_profiles', 'academic_sessions', 'support_tickets')
    LOOP
        EXECUTE format('CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column()', t, t);
    END LOOP;
END $$;
