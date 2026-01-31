-- Migration: Manual Presence Status
-- Description: Adds status mode and expands presence status options

-- 1. Create type for presence mode if not exists
DO $$ BEGIN
    CREATE TYPE presence_mode AS ENUM ('AUTO', 'MANUAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Add presence_mode column to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS presence_mode presence_mode DEFAULT 'AUTO';

-- 3. Update presence_status constraint if it exists
-- Since we are using a check constraint or just text, let's make sure it's flexible
-- If it was an enum, we'd need to add 'BUSY'
-- Checking packages/shared/migrations/0030_multi_assignee_tasks.sql, it used:
-- presence_status TEXT DEFAULT 'OFFLINE'

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_presence_status_check;
ALTER TABLE users ADD CONSTRAINT users_presence_status_check 
CHECK (presence_status IN ('ONLINE', 'OFFLINE', 'AWAY', 'BUSY'));
