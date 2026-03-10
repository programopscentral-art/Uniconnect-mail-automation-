-- Fix subjects unique constraint: allow same subject code in different programs/terms
-- Old constraint (too restrictive): (university_id, code) — blocked same code across branches
-- New constraint (correct): (term_id, code) — allows same subject in multiple programs

ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_university_code_unique;

ALTER TABLE subjects ADD CONSTRAINT subjects_term_code_unique UNIQUE (term_id, code);
