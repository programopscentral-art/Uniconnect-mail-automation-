-- Success Coach Performance Tracking
-- BOAs log daily calls made vs targets for each success coach.

CREATE TABLE IF NOT EXISTS success_coach_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    name text NOT NULL,
    email text,
    phone text,
    daily_call_target int NOT NULL DEFAULT 15,
    is_active boolean NOT NULL DEFAULT true,
    created_by uuid REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_profiles_university ON success_coach_profiles(university_id);

CREATE TABLE IF NOT EXISTS success_coach_daily_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id uuid NOT NULL REFERENCES success_coach_profiles(id) ON DELETE CASCADE,
    university_id uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    date date NOT NULL,
    student_calls_made int NOT NULL DEFAULT 0,
    parent_calls_made int NOT NULL DEFAULT 0,
    daily_target int NOT NULL DEFAULT 15,
    notes text,
    logged_by uuid NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(coach_id, date)
);

CREATE INDEX IF NOT EXISTS idx_coach_daily_log_date ON success_coach_daily_log(university_id, date);
