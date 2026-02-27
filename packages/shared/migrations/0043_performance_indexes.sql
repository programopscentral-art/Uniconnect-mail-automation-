-- Performance optimization indexes

-- 1. Assessment Module Indexes
CREATE INDEX IF NOT EXISTS idx_assessment_subjects_branch ON assessment_subjects(branch_id);
CREATE INDEX IF NOT EXISTS idx_assessment_units_subject ON assessment_units(subject_id);
CREATE INDEX IF NOT EXISTS idx_assessment_topics_unit ON assessment_topics(unit_id);
CREATE INDEX IF NOT EXISTS idx_assessment_topics_parent ON assessment_topics(parent_topic_id);
CREATE INDEX IF NOT EXISTS idx_assessment_questions_unit ON assessment_questions(unit_id);
CREATE INDEX IF NOT EXISTS idx_assessment_questions_topic ON assessment_questions(topic_id);
CREATE INDEX IF NOT EXISTS idx_assessment_questions_co ON assessment_questions(co_id);
CREATE INDEX IF NOT EXISTS idx_assessment_questions_created ON assessment_questions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assessment_papers_subject ON assessment_papers(subject_id);
CREATE INDEX IF NOT EXISTS idx_assessment_papers_university ON assessment_papers(university_id);
CREATE INDEX IF NOT EXISTS idx_assessment_papers_batch ON assessment_papers(batch_id);
CREATE INDEX IF NOT EXISTS idx_assessment_papers_branch ON assessment_papers(branch_id);
CREATE INDEX IF NOT EXISTS idx_assessment_papers_created ON assessment_papers(created_at DESC);

-- 2. Task Module Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_university ON tasks(university_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_by ON tasks(assigned_by);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_task_assignees_task ON task_assignees(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON task_assignees(user_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_status ON task_assignees(status);

-- 3. Core System Indexes
CREATE INDEX IF NOT EXISTS idx_users_university ON users(university_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_mailbox_email ON mailbox_connections(email);
CREATE INDEX IF NOT EXISTS idx_students_external_id ON students(external_id);
CREATE INDEX IF NOT EXISTS idx_students_created_at ON students(created_at DESC);
