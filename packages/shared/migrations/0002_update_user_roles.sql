-- Migration: Update user role check constraint

-- Drop old constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- Add new constraint with expanded roles
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('ADMIN', 'UNIVERSITY_OPERATOR', 'COS/PM', 'PM', 'PMA/BOA'));
