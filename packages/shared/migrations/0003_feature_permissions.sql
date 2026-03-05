-- Create role_permissions table
CREATE TABLE IF NOT EXISTS role_permissions (
    role VARCHAR(50) PRIMARY KEY,
    features JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed initial permissions based on existing role logic
-- ADMIN and PROGRAM_OPS usually have access to everything
-- UNIVERSITY_OPERATOR has limited access
-- Staff roles (BOA, PM, COS, PMA) have specific operational access

INSERT INTO role_permissions (role, features) VALUES
('ADMIN', '["dashboard", "tasks", "universities", "students", "users", "analytics", "mailboxes", "templates", "campaigns", "assessments", "mail-logs", "permissions"]'),
('PROGRAM_OPS', '["dashboard", "tasks", "universities", "students", "users", "analytics", "mailboxes", "templates", "campaigns", "assessments", "mail-logs", "permissions"]'),
('UNIVERSITY_OPERATOR', '["dashboard", "tasks", "students", "analytics", "mailboxes", "templates", "campaigns", "assessments"]'),
('COS', '["dashboard", "tasks", "students", "analytics", "templates", "campaigns", "assessments"]'),
('PM', '["dashboard", "tasks", "students", "analytics", "templates", "campaigns", "assessments"]'),
('PMA', '["dashboard", "tasks", "students", "analytics", "templates", "campaigns", "assessments"]'),
('BOA', '["dashboard", "tasks", "students", "analytics", "templates", "campaigns", "assessments"]')
ON CONFLICT (role) DO NOTHING;
