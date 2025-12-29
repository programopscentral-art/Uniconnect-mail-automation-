-- Migration: Enhance tasks with priority and update status options

-- 1. Add priority column
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('URGENT', 'HIGH', 'MEDIUM', 'LOW'));

-- 2. Update status constraint
-- First, we need to drop the old anonymous constraint. 
-- In Postgres, we can find it by looking at pg_constraint.
DO $$ 
DECLARE 
    constr_name TEXT;
BEGIN 
    SELECT conname INTO constr_name 
    FROM pg_constraint 
    WHERE conrelid = 'tasks'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%status%PENDING%COMPLETED%CANCELLED%';
    
    IF constr_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE tasks DROP CONSTRAINT ' || constr_name;
    END IF;
END $$;

ALTER TABLE tasks ADD CONSTRAINT tasks_status_check CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'));
