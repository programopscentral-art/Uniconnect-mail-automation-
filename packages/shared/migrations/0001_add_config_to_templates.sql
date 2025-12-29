DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='templates' AND column_name='config') THEN
        ALTER TABLE templates ADD COLUMN config jsonb DEFAULT '{}'::jsonb;
    END IF;
END $$;
