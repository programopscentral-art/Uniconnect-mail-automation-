-- Migration: template_isolation_and_assets
-- Adds base_template_id and assets_json to templates, and creates university_assets table.

-- Create university_assets table
CREATE TABLE IF NOT EXISTS university_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('image', 'logo', 'seal', 'other')),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add updated_at trigger for university_assets
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_timestamp_university_assets') THEN
        CREATE TRIGGER set_timestamp_university_assets BEFORE UPDATE ON university_assets FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
END $$;

-- Enhance assessment_templates table
ALTER TABLE assessment_templates ADD COLUMN IF NOT EXISTS base_template_id UUID REFERENCES assessment_templates(id) ON DELETE SET NULL;
ALTER TABLE assessment_templates ADD COLUMN IF NOT EXISTS assets_json JSONB DEFAULT '[]'::jsonb;

-- Add index for performance
CREATE INDEX IF NOT EXISTS assessment_templates_base_id_idx ON assessment_templates(base_template_id);
CREATE INDEX IF NOT EXISTS university_assets_university_id_idx ON university_assets(university_id);

-- Ensure uniqueness of template names per university and version
-- We check if the constraint already exists before adding
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assessment_templates_uni_name_version_unique') THEN
        ALTER TABLE assessment_templates ADD CONSTRAINT assessment_templates_uni_name_version_unique UNIQUE(university_id, name, version);
    END IF;
END $$;
