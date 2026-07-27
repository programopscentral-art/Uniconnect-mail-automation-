-- SME (Subject Matter Expert) role.
--
-- SMEs are content developers who create exam papers. This migration:
--   1. Extends the users.role CHECK constraint to allow 'SME'.
--   2. Seeds the SME row in role_permissions with EXAMINATIONS-ONLY access —
--      the exam-paper / question-paper generator ("assessments", shown as
--      "Examinations" in the sidebar) plus read access to the examinations
--      module ("academic-operations"). All-universities scope is granted in
--      code (api/universities readAllowedRoles), not via user_universities.
--   3. Creates the 8 SME users from the shared onboarding sheet. They sign in
--      via Google SSO (matched by email); no primary university_id is set
--      because SME is an all-universities role (hooks.server.ts exempts SME
--      from the "no university -> request-access" redirect).

BEGIN;

-- 1. Allow the SME role.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (
    role IN (
        'ADMIN','PROGRAM_OPS','UNIVERSITY_OPERATOR','COS','PM','PMA','BOA',
        'CMA','CMA_MANAGER','SET_REVIEWER','PROPOSER','FACULTY','STUDENT',
        'STAKEHOLDER','SUPPORT','SME'
    )
);

-- 2. Seed SME permissions (examinations only).
INSERT INTO role_permissions (role, features)
VALUES ('SME', '["dashboard","tasks","assessments","academic-operations"]'::jsonb)
ON CONFLICT (role) DO UPDATE
    SET features = EXCLUDED.features, updated_at = NOW();

-- 3. Create the 8 SME users (idempotent by email).
INSERT INTO users (id, email, name, role, is_active, created_at, updated_at)
VALUES
    (gen_random_uuid(), 'bhoushitha.a@nxtwave.co.in',            'Bhoushitha A',            'SME', true, NOW(), NOW()),
    (gen_random_uuid(), 'venkatamanojkumar.d@nxtwave.co.in',     'Venkata Manoj Kumar D',   'SME', true, NOW(), NOW()),
    (gen_random_uuid(), 'poshala.varsha@nxtwave.co.in',          'Poshala Varsha',          'SME', true, NOW(), NOW()),
    (gen_random_uuid(), 'alka.kumari@nxtwave.co.in',             'Alka Kumari',             'SME', true, NOW(), NOW()),
    (gen_random_uuid(), 'poojitha.pachava@nxtwave.co.in',        'Pachava Poojitha',        'SME', true, NOW(), NOW()),
    (gen_random_uuid(), 'pinisetti.viswanadh@nxtwave.co.in',     'Pinisetti Viswanadh',     'SME', true, NOW(), NOW()),
    (gen_random_uuid(), 'mariyam.khan@nxtwave.co.in',            'Mariyam Khan',            'SME', true, NOW(), NOW()),
    (gen_random_uuid(), 'chinthapalli.viharika@nxtwave.co.in',   'Chinthapalli Viharika',   'SME', true, NOW(), NOW())
ON CONFLICT (email) DO UPDATE
    SET role = 'SME', is_active = true, updated_at = NOW();

COMMIT;
