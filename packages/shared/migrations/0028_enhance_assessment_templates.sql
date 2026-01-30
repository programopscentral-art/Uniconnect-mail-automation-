-- Add isolation and versioning fields
ALTER TABLE assessment_templates ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE assessment_templates ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE assessment_templates ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived'));
ALTER TABLE assessment_templates ADD COLUMN IF NOT EXISTS layout_schema JSONB DEFAULT '{}'::jsonb;
ALTER TABLE assessment_templates ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE assessment_templates ADD COLUMN IF NOT EXISTS updated_by UUID;

-- Backfill slugs for existing templates if title exists
UPDATE assessment_templates SET slug = LOWER(REPLACE(name, ' ', '-')) WHERE slug IS NULL;

-- Add uniqueness constraint (only if not exists - would need a more complex check in SQL, but for a new migration we just add it)
-- Note: We handle potential duplicates manually if this were a live production push, but here we assume clean transition or conflict resolution
-- ALTER TABLE assessment_templates ADD CONSTRAINT assessment_templates_uni_slug_version_unique UNIQUE(university_id, slug, version);

-- Create revision history table
CREATE TABLE IF NOT EXISTS assessment_template_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES assessment_templates(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    config JSONB NOT NULL,
    layout_schema JSONB NOT NULL,
    changed_by UUID,
    diff JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS assessment_template_revisions_template_id_idx ON assessment_template_revisions(template_id);
