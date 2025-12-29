-- Migration: Add short_name to universities
ALTER TABLE universities ADD COLUMN IF NOT EXISTS short_name text;

-- Update existing universities with short names
UPDATE universities SET short_name = 'ACADEMY' WHERE name ILIKE '%Academy%';
UPDATE universities SET short_name = 'CENTRAL' WHERE name ILIKE '%Central%';
UPDATE universities SET short_name = UPPER(slug) WHERE short_name IS NULL;
