-- Migration: 0065_multi_branch_exam_plans
-- Redesign exam plans to support multi-branch (batch + semester) instead of single program

-- 1. Add batch_id and semester_number to exam_plans
ALTER TABLE exam_plans ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES academic_batches(id) ON DELETE SET NULL;
ALTER TABLE exam_plans ADD COLUMN IF NOT EXISTS semester_number INTEGER;
ALTER TABLE exam_plans ADD COLUMN IF NOT EXISTS term_ids UUID[];
ALTER TABLE exam_plans ADD COLUMN IF NOT EXISTS covered_programs_json JSONB;

-- 2. Make program_id and term_id nullable (plan now spans multiple programs)
ALTER TABLE exam_plans ALTER COLUMN program_id DROP NOT NULL;
ALTER TABLE exam_plans ALTER COLUMN term_id DROP NOT NULL;

-- 3. Add semester_number to terms (for grouping across programs)
ALTER TABLE terms ADD COLUMN IF NOT EXISTS semester_number INTEGER;

-- 4. Backfill semester_number from term names
UPDATE terms SET semester_number = (
    CASE
        WHEN name ~* 'semester\s*(\d+)' THEN (regexp_match(name, 'semester\s*(\d+)', 'i'))[1]::integer
        ELSE NULL
    END
) WHERE semester_number IS NULL;

-- 5. Add batch_id to sections
ALTER TABLE sections ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES academic_batches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sections_batch_id ON sections(batch_id);

-- 6. Backfill sections.batch_id from student_profiles
UPDATE sections s SET batch_id = sub.batch_id
FROM (
    SELECT DISTINCT ON (sp.section_id) sp.section_id, sp.batch_id
    FROM student_profiles sp
    WHERE sp.batch_id IS NOT NULL
    GROUP BY sp.section_id, sp.batch_id
    ORDER BY sp.section_id, COUNT(*) DESC
) sub
WHERE s.id = sub.section_id AND s.batch_id IS NULL;

-- 7. Index for faster queries
CREATE INDEX IF NOT EXISTS idx_terms_semester_number ON terms(university_id, semester_number);
CREATE INDEX IF NOT EXISTS idx_exam_plans_batch_id ON exam_plans(batch_id);
