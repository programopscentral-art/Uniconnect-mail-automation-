-- UNI-CONNECT: COMPREHENSIVE SCHEMA REPAIR SCRIPT
-- RUN THIS IN YOUR SUPABASE SQL EDITOR

-- 1. REPAIR PROGRAMS TABLE
ALTER TABLE programs ADD COLUMN IF NOT EXISTS university_id UUID REFERENCES universities(id) ON DELETE CASCADE;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS campus_id UUID REFERENCES campuses(id) ON DELETE SET NULL;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS degree_type TEXT;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS semester_count INTEGER;

-- 2. REPAIR TERMS TABLE
ALTER TABLE terms ADD COLUMN IF NOT EXISTS university_id UUID REFERENCES universities(id) ON DELETE CASCADE;
ALTER TABLE terms ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES programs(id) ON DELETE CASCADE;
ALTER TABLE terms ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE terms ADD COLUMN IF NOT EXISTS end_date DATE;

-- 3. REPAIR SECTIONS TABLE
ALTER TABLE sections ADD COLUMN IF NOT EXISTS university_id UUID REFERENCES universities(id) ON DELETE CASCADE;
ALTER TABLE sections ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES programs(id) ON DELETE CASCADE;
ALTER TABLE sections ADD COLUMN IF NOT EXISTS term_id UUID REFERENCES terms(id) ON DELETE CASCADE;
ALTER TABLE sections ADD COLUMN IF NOT EXISTS batch_code TEXT;
ALTER TABLE sections ADD COLUMN IF NOT EXISTS strength INTEGER;

-- 4. REPAIR SUBJECTS TABLE
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS university_id UUID REFERENCES universities(id) ON DELETE CASCADE;
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES programs(id) ON DELETE CASCADE;
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS term_id UUID REFERENCES terms(id) ON DELETE CASCADE;
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS code TEXT;

-- 5. UPDATE CONSTRAINTS
-- We use DO blocks to safely drop old name-based constraints if they exist

-- Programs
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='programs_code_key') THEN
        ALTER TABLE programs DROP CONSTRAINT programs_code_key;
    END IF;
END $$;
ALTER TABLE programs ADD CONSTRAINT programs_university_code_unique UNIQUE (university_id, code);

-- Sections
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='sections_batch_code_key') THEN
        ALTER TABLE sections DROP CONSTRAINT sections_batch_code_key;
    END IF;
END $$;
-- Only add constraint if batch_code is not null in all rows (sanitize first)
UPDATE sections SET batch_code = 'GEN-' || id::text WHERE batch_code IS NULL;
ALTER TABLE sections ALTER COLUMN batch_code SET NOT NULL;
ALTER TABLE sections ADD CONSTRAINT sections_university_batch_unique UNIQUE (university_id, batch_code);

-- Subjects
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='subjects_code_key') THEN
        ALTER TABLE subjects DROP CONSTRAINT subjects_code_key;
    END IF;
END $$;
ALTER TABLE subjects ADD CONSTRAINT subjects_university_code_unique UNIQUE (university_id, code);
