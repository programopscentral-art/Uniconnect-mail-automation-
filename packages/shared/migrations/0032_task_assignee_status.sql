-- Add status column to task_assignees to track individual progress
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='task_assignees' AND column_name='status') THEN
        ALTER TABLE task_assignees ADD COLUMN status VARCHAR(20) DEFAULT 'PENDING';
    END IF;
END $$;
