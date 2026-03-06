-- Add unique constraint to external_id for student updates via CSV
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'students_university_external_id_unique'
    ) THEN
        ALTER TABLE students ADD CONSTRAINT students_university_external_id_unique UNIQUE (university_id, external_id);
    END IF;
END $$;
