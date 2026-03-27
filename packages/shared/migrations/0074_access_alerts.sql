-- Throttle table for admin email alerts on sensitive data access
CREATE TABLE IF NOT EXISTS access_alert_throttle (
    accessor_id UUID NOT NULL REFERENCES users(id),
    student_profile_id UUID NOT NULL REFERENCES student_profiles(id),
    last_alerted_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (accessor_id, student_profile_id)
);
