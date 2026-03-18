-- Migration: Add bench configuration columns to classrooms table
-- These support the BookMyShow-style visual bench layout and exam seating

-- Ensure columns from 0052 schema exist (in case 0047 created the table first)
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS campus_id UUID REFERENCES campuses(id) ON DELETE SET NULL;
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS room_type TEXT;
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ACTIVE';
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS metadata_json JSONB DEFAULT '{}'::jsonb;

-- Bench configuration columns
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS building TEXT;
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS total_benches INTEGER DEFAULT 0;
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS seats_per_bench INTEGER DEFAULT 2;
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS invigilators_required INTEGER DEFAULT 1;
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS bench_rows INTEGER DEFAULT 0;
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS bench_columns INTEGER DEFAULT 0;
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS layout_type TEXT DEFAULT 'grid';

-- Backfill code from name where missing
UPDATE classrooms SET code = UPPER(REPLACE(LEFT(name, 20), ' ', '-')) WHERE code IS NULL;
ALTER TABLE classrooms ALTER COLUMN code SET NOT NULL;

-- Create the unique constraint needed for ON CONFLICT upsert (if not exists)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'classrooms_university_id_campus_id_code_key'
    ) THEN
        ALTER TABLE classrooms ADD CONSTRAINT classrooms_university_id_campus_id_code_key UNIQUE (university_id, campus_id, code);
    END IF;
END $$;
