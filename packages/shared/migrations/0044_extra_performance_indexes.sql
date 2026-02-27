-- Additional performance indexes for Dashboard and Subject pages

-- 1. Campaigns optimization
CREATE INDEX IF NOT EXISTS idx_campaigns_university ON campaigns(university_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_started_at ON campaigns(started_at);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);

-- 2. User Universities optimization
CREATE INDEX IF NOT EXISTS idx_user_universities_user ON user_universities(user_id);
CREATE INDEX IF NOT EXISTS idx_user_universities_univ ON user_universities(university_id);

-- 3. Users optimization
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active) WHERE is_active = true;

-- 4. Assessment Questions optimization
CREATE INDEX IF NOT EXISTS idx_assessment_questions_unit_marks ON assessment_questions(unit_id, marks);

-- 5. Tasks optimization
CREATE INDEX IF NOT EXISTS idx_tasks_due_date_status ON tasks(due_date, status) WHERE status != 'COMPLETED';
