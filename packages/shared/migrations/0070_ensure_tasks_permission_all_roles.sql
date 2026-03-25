-- Ensure ALL roles have 'tasks' in their permissions (core feature for everyone)
-- This fixes the issue where roles without explicit role_permissions rows
-- couldn't see or create tasks on the dashboard or task center

-- Add 'tasks' to every existing role that doesn't already have it
UPDATE role_permissions
SET features = features || '["tasks"]'::jsonb,
    updated_at = NOW()
WHERE NOT (features @> '["tasks"]'::jsonb);

-- Insert role_permissions rows for roles that don't have ANY row yet
INSERT INTO role_permissions (role, features)
SELECT r.role, '["dashboard", "tasks", "students"]'::jsonb
FROM (VALUES ('BOA'), ('UNIVERSITY_OPERATOR'), ('COS'), ('PM'), ('PMA'), ('CMA'), ('CMA_MANAGER'), ('FACULTY'), ('SUPPORT')) AS r(role)
WHERE NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role = r.role);
