-- Assessment & Question Paper Module Schema

-- 1. Batches (e.g. 2022-2026)
CREATE TABLE assessment_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- e.g. "2022-2026 Batch"
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Branches (e.g. CSE, AIML)
CREATE TABLE assessment_branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT, -- e.g. "CSE"
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Subjects
CREATE TABLE assessment_subjects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id UUID NOT NULL REFERENCES assessment_branches(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT, -- e.g. "CS101"
    semester INTEGER NOT NULL,
    syllabus_content TEXT, -- RAW text or markdown
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Units
CREATE TABLE assessment_units (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subject_id UUID NOT NULL REFERENCES assessment_subjects(id) ON DELETE CASCADE,
    unit_number INTEGER NOT NULL,
    name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Topics & Subtopics
CREATE TABLE assessment_topics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unit_id UUID NOT NULL REFERENCES assessment_units(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    parent_topic_id UUID REFERENCES assessment_topics(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Questions
CREATE TYPE bloom_level AS ENUM ('L1', 'L2', 'L3');

CREATE TABLE assessment_questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    topic_id UUID NOT NULL REFERENCES assessment_topics(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    bloom_level bloom_level DEFAULT 'L1',
    marks INTEGER DEFAULT 2,
    answer_key TEXT, -- Manual or auto-generated explanation
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Question Papers (Generated Sets)
CREATE TYPE exam_type AS ENUM ('MID1', 'MID2', 'SEM', 'INTERNAL_LAB', 'EXTERNAL_LAB');

CREATE TABLE assessment_papers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES assessment_batches(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES assessment_branches(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES assessment_subjects(id) ON DELETE CASCADE,
    exam_type exam_type NOT NULL,
    semester INTEGER NOT NULL,
    paper_date DATE,
    duration_minutes INTEGER,
    max_marks INTEGER,
    sets_data JSONB, -- Stores metadata for each set (A, B, C, D) including question IDs
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Timestamps triggers
CREATE TRIGGER set_timestamp_batches BEFORE UPDATE ON assessment_batches FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER set_timestamp_branches BEFORE UPDATE ON assessment_branches FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER set_timestamp_subjects BEFORE UPDATE ON assessment_subjects FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER set_timestamp_units BEFORE UPDATE ON assessment_units FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER set_timestamp_topics BEFORE UPDATE ON assessment_topics FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER set_timestamp_questions BEFORE UPDATE ON assessment_questions FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER set_timestamp_papers BEFORE UPDATE ON assessment_papers FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
