-- Migration: 0064_exam_timetable_generation
-- Adds support for auto-generated exam timetables

-- 1. UNIQUE constraint on exam_seating_plans(exam_id, classroom_id) for ON CONFLICT upsert
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'exam_seating_plans_exam_id_classroom_id_key'
    ) THEN
        ALTER TABLE exam_seating_plans
            ADD CONSTRAINT exam_seating_plans_exam_id_classroom_id_key
            UNIQUE (exam_id, classroom_id);
    END IF;
END $$;

-- 2. New columns on exam_plans for timetable generation config
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'exam_plans' AND column_name = 'time_slots_json'
    ) THEN
        ALTER TABLE exam_plans ADD COLUMN time_slots_json JSONB;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'exam_plans' AND column_name = 'available_classroom_ids'
    ) THEN
        ALTER TABLE exam_plans ADD COLUMN available_classroom_ids UUID[];
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'exam_plans' AND column_name = 'generation_config_json'
    ) THEN
        ALTER TABLE exam_plans ADD COLUMN generation_config_json JSONB;
    END IF;
END $$;
