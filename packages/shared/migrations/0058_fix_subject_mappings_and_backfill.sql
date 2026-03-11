-- 0. Fix subjects unique constraint — drop ALL possible constraint names
-- Migration 0052 creates UNIQUE(university_id, code) which auto-generates name "subjects_university_id_code_key"
-- Migration 0056 tried to drop "subjects_university_code_unique" which is the wrong name
-- The correct constraint should be UNIQUE(term_id, code) to allow same code across programs
ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_university_id_code_key;
ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_university_code_unique;
ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_university_id_code;
-- Re-add the correct constraint (idempotent — skip if already exists from migration 0056)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subjects_term_code_unique') THEN
        ALTER TABLE subjects ADD CONSTRAINT subjects_term_code_unique UNIQUE (term_id, code);
    END IF;
END $$;

-- 1. Backfill subjects.university_id from programs (via terms) where it's NULL
UPDATE subjects s
SET university_id = p.university_id
FROM terms t
JOIN programs p ON p.id = t.program_id
WHERE s.term_id = t.id
AND s.university_id IS NULL;

-- 2. Backfill subjects.is_active where it's NULL
UPDATE subjects SET is_active = TRUE WHERE is_active IS NULL;

-- 3. Remove duplicate faculty_subject_mappings (keep earliest per faculty+subject)
DELETE FROM faculty_subject_mappings
WHERE id NOT IN (
    SELECT DISTINCT ON (faculty_profile_id, subject_id) id
    FROM faculty_subject_mappings
    ORDER BY faculty_profile_id, subject_id, created_at ASC
);

-- 4. Add unique constraint on faculty_subject_mappings to prevent duplicates
ALTER TABLE faculty_subject_mappings
    DROP CONSTRAINT IF EXISTS fsm_faculty_subject_unique;
ALTER TABLE faculty_subject_mappings
    ADD CONSTRAINT fsm_faculty_subject_unique UNIQUE (faculty_profile_id, subject_id);
