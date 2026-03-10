-- Add leave_end_date for multi-day range support
ALTER TABLE faculty_leave_requests
    ADD COLUMN IF NOT EXISTS leave_end_date DATE,
    ADD COLUMN IF NOT EXISTS total_days INTEGER GENERATED ALWAYS AS (
        CASE WHEN leave_end_date IS NOT NULL
             THEN (leave_end_date - leave_date) + 1
             ELSE 1
        END
    ) STORED;

-- Back-fill: set leave_end_date = leave_date for existing single-day requests
UPDATE faculty_leave_requests SET leave_end_date = leave_date WHERE leave_end_date IS NULL;

-- also add updated_at if missing
ALTER TABLE faculty_leave_requests
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Leave approval routing: CO (1-2 days) vs Central (3+ days)
ALTER TABLE faculty_leave_requests
    ADD COLUMN IF NOT EXISTS approval_level TEXT DEFAULT 'CO', -- 'CO' | 'CENTRAL'
    ADD COLUMN IF NOT EXISTS substitute_faculty_profile_id UUID REFERENCES faculty_profiles(id);
