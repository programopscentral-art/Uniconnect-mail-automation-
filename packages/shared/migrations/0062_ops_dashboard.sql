-- Operations Dashboard tables
-- Stores daily operational data per university (synced from Google Sheets)

CREATE TABLE IF NOT EXISTS ops_sheet_config (
    id SERIAL PRIMARY KEY,
    sheet_url TEXT NOT NULL,
    sheet_name TEXT DEFAULT 'Sheet1',
    last_synced_at TIMESTAMPTZ,
    sync_interval_minutes INT DEFAULT 10,
    is_active BOOLEAN DEFAULT true,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ops_daily_data (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    university_name TEXT NOT NULL,

    -- Sessions
    sessions_planned INT DEFAULT 0,
    sessions_completed INT DEFAULT 0,
    sessions_cancelled INT DEFAULT 0,

    -- Attendance
    enrolled INT DEFAULT 0,
    attended INT DEFAULT 0,

    -- Calls
    coach_calls INT DEFAULT 0,
    parent_calls INT DEFAULT 0,

    -- Instructors
    instructors_total INT DEFAULT 0,
    instructors_on_leave INT DEFAULT 0,

    -- Events
    events_planned INT DEFAULT 0,
    events_executed INT DEFAULT 0,
    events_cancelled INT DEFAULT 0,

    -- Exams
    exams_planned INT DEFAULT 0,
    exams_completed INT DEFAULT 0,

    -- Communications
    post_exam_comms_sent INT DEFAULT 0,

    -- At-risk
    at_risk_total INT DEFAULT 0,
    at_risk_informed INT DEFAULT 0,

    -- Acknowledgments
    acknowledgments INT DEFAULT 0,

    -- Daily Reports
    report_submitted_by TEXT,
    report_submitted_at TEXT,
    instructor_report TEXT DEFAULT 'Missing',
    coach_report TEXT DEFAULT 'Missing',
    ops_report TEXT DEFAULT 'Missing',

    -- Team Activity (aggregated per university)
    instructors_active INT DEFAULT 0,
    coaches_active INT DEFAULT 0,
    program_ops_active INT DEFAULT 0,
    total_calls_made INT DEFAULT 0,
    tickets_resolved INT DEFAULT 0,
    clicks_shares_sent INT DEFAULT 0,
    avg_hours_instructors NUMERIC(4,1) DEFAULT 0,
    avg_hours_coaches NUMERIC(4,1) DEFAULT 0,
    avg_hours_program_ops NUMERIC(4,1) DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(date, university_name)
);

-- Instructor-level daily activity data
CREATE TABLE IF NOT EXISTS ops_instructor_daily (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    university_name TEXT NOT NULL,
    instructor_name TEXT NOT NULL,
    role TEXT DEFAULT 'Instructor',

    teach_sessions_planned INT DEFAULT 0,
    teach_sessions_done INT DEFAULT 0,
    practice_sessions_planned INT DEFAULT 0,
    practice_sessions_done INT DEFAULT 0,
    hours_logged NUMERIC(4,1) DEFAULT 0,
    calls_made INT DEFAULT 0,
    tickets_resolved INT DEFAULT 0,
    clicks_shares_sent INT DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(date, university_name, instructor_name)
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_ops_daily_date ON ops_daily_data(date);
CREATE INDEX IF NOT EXISTS idx_ops_daily_university ON ops_daily_data(university_name);
CREATE INDEX IF NOT EXISTS idx_ops_daily_date_univ ON ops_daily_data(date, university_name);
CREATE INDEX IF NOT EXISTS idx_ops_instructor_date ON ops_instructor_daily(date);
CREATE INDEX IF NOT EXISTS idx_ops_instructor_univ ON ops_instructor_daily(university_name);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_ops_daily_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ops_daily_data_updated_at ON ops_daily_data;
CREATE TRIGGER ops_daily_data_updated_at
    BEFORE UPDATE ON ops_daily_data
    FOR EACH ROW
    EXECUTE FUNCTION update_ops_daily_updated_at();

DROP TRIGGER IF EXISTS ops_sheet_config_updated_at ON ops_sheet_config;
CREATE TRIGGER ops_sheet_config_updated_at
    BEFORE UPDATE ON ops_sheet_config
    FOR EACH ROW
    EXECUTE FUNCTION update_ops_daily_updated_at();
