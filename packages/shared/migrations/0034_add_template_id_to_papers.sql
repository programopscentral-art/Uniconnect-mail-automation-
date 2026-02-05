-- Migration: add_template_id_to_papers
-- Adds template_id column to assessment_papers table.

ALTER TABLE assessment_papers ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES assessment_templates(id) ON DELETE SET NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS assessment_papers_template_id_idx ON assessment_papers(template_id);
