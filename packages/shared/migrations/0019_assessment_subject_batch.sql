-- Add batch_id to assessment_subjects to allow batch-specific syllabuses
ALTER TABLE assessment_subjects ADD COLUMN batch_id UUID REFERENCES assessment_batches(id) ON DELETE CASCADE;

-- Optional: Create an index for performance
CREATE INDEX idx_assessment_subjects_batch ON assessment_subjects(batch_id);
