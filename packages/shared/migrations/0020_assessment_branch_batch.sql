-- Add batch_id to assessment_branches to allow batch-specific departments
ALTER TABLE assessment_branches ADD COLUMN batch_id UUID REFERENCES assessment_batches(id) ON DELETE CASCADE;

-- Create an index for performance
CREATE INDEX idx_assessment_branches_batch ON assessment_branches(batch_id);
