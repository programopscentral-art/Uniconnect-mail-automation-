-- Expand PII encryption to include: date_of_birth, gender, blood_group, father_name, mother_name
-- These fields were previously stored as plain text in student_profiles.
-- After the Node.js migration script runs, the plain-text columns can be dropped.

-- Temporary flag to track migration progress per row
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS pii_migration_complete BOOLEAN DEFAULT FALSE;
