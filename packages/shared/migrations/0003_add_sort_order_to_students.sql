-- Add sort_order to students if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='sort_order') THEN
        ALTER TABLE students ADD COLUMN sort_order integer DEFAULT 0;
    END IF;
END $$;

-- Add updated_at to students if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='updated_at') THEN
        ALTER TABLE students ADD COLUMN updated_at timestamptz DEFAULT now();
    END IF;
END $$;
