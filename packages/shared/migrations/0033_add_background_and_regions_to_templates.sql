-- Migration: add_background_and_regions_to_templates
ALTER TABLE assessment_templates ADD COLUMN IF NOT EXISTS background_image_url TEXT;
ALTER TABLE assessment_templates ADD COLUMN IF NOT EXISTS regions JSONB DEFAULT '[]'::jsonb;
