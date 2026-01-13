-- Create assessment_course_outcomes table
CREATE TABLE IF NOT EXISTS assessment_course_outcomes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id uuid NOT NULL REFERENCES assessment_subjects(id) ON DELETE CASCADE,
    code text NOT NULL, -- e.g., 'CO1', 'CO2'
    description text NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(subject_id, code)
);

-- Add updated_at trigger for COs
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_assessment_course_outcomes_updated_at') THEN
        CREATE TRIGGER update_assessment_course_outcomes_updated_at BEFORE UPDATE ON assessment_course_outcomes FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
END $$;

-- Add co_id to questions
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS co_id uuid REFERENCES assessment_course_outcomes(id) ON DELETE SET NULL;
