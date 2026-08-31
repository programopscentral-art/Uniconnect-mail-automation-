-- Add a first-class FACILITIES role for the facilities / finance-ops team.
--
-- Facilities see the Finance Console (petty cash + budget proposals) and handle
-- the money legs of petty cash — disbursement, bill verification, settlement.
-- Approval stays with the approver roles (CMA Manager / Admin / Program Ops),
-- per the design ("nothing moves without Satish's approval").

BEGIN;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (
    role = ANY (ARRAY[
        'ADMIN','PROGRAM_OPS','UNIVERSITY_OPERATOR','COS','PM','PMA','BOA',
        'CMA','CMA_MANAGER','SET_REVIEWER','PROPOSER','FACULTY','STUDENT',
        'STAKEHOLDER','SUPPORT','SME','FACILITIES'
    ])
);

INSERT INTO role_permissions (role, features)
VALUES ('FACILITIES', '["dashboard","tasks","budget-proposals","petty-cash"]'::jsonb)
ON CONFLICT (role) DO UPDATE SET features = EXCLUDED.features, updated_at = NOW();

COMMIT;
