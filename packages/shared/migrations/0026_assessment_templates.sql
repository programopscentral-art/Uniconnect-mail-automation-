-- Create assessment_templates table
CREATE TABLE IF NOT EXISTS assessment_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    exam_type TEXT NOT NULL, -- e.g. 'MID1', 'MID2', 'SEM'
    config JSONB NOT NULL,    -- Stores the paperStructure
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add updated_at trigger
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_timestamp_assessment_templates') THEN
        CREATE TRIGGER set_timestamp_assessment_templates BEFORE UPDATE ON assessment_templates FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
END $$;
