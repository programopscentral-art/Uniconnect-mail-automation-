-- 0066: Secure Student Admission Integration System
-- Adds encrypted PII storage, document management, admission workflows, and audit logging

-- ═══ 1. Extend student_profiles with encrypted PII ═══
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS encrypted_pii JSONB DEFAULT '{}'::jsonb;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS pii_fields_present TEXT[] DEFAULT '{}';
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS niat_id TEXT;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS father_name TEXT;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS mother_name TEXT;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS blood_group TEXT;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS address_line1 TEXT;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS address_city TEXT;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS address_state TEXT;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS address_pincode TEXT;

-- ═══ 2. Extend documents table for encrypted file storage ═══
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN DEFAULT FALSE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS encryption_iv TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_content TEXT; -- base64 or encrypted base64
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT DEFAULT 0;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'GENERAL';

-- ═══ 3. Admission workflows ═══
CREATE TABLE IF NOT EXISTS admission_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_profile_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    workflow_status TEXT NOT NULL DEFAULT 'INITIATED',
    current_step TEXT DEFAULT 'PERSONAL_INFO',
    assigned_reviewer_id UUID REFERENCES users(id),
    remarks TEXT,
    submitted_at TIMESTAMPTZ,
    reviewed_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata_json JSONB DEFAULT '{}'::jsonb,
    UNIQUE(student_profile_id)
);

-- ═══ 4. Document access audit log ═══
CREATE TABLE IF NOT EXISTS document_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    student_profile_id UUID REFERENCES student_profiles(id) ON DELETE SET NULL,
    accessed_by UUID NOT NULL REFERENCES users(id),
    access_type TEXT NOT NULL, -- VIEW, DOWNLOAD, DELETE, UPLOAD
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ 5. Student document types reference ═══
CREATE TABLE IF NOT EXISTS student_document_types (
    code TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    is_sensitive BOOLEAN DEFAULT FALSE,
    is_required BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0
);

INSERT INTO student_document_types (code, label, is_sensitive, is_required, sort_order) VALUES
    ('CERTIFICATE_10TH', '10th Certificate', false, true, 1),
    ('CERTIFICATE_12TH', '12th Certificate', false, true, 2),
    ('DEGREE_CERTIFICATE', 'Degree Certificate', false, false, 3),
    ('MARKSHEET_10TH', '10th Marksheet', false, true, 4),
    ('MARKSHEET_12TH', '12th Marksheet', false, true, 5),
    ('ID_PROOF_AADHAAR', 'Aadhaar Card', true, true, 6),
    ('ID_PROOF_PAN', 'PAN Card', true, false, 7),
    ('PASSPORT_PHOTO', 'Passport Photo', false, true, 8),
    ('SIGNATURE', 'Signature', false, true, 9),
    ('PAYMENT_RECEIPT', 'Payment Receipt', false, true, 10),
    ('FEE_RECEIPT', 'Fee Receipt', false, false, 11),
    ('TRANSFER_CERTIFICATE', 'Transfer Certificate', false, false, 12),
    ('MIGRATION_CERTIFICATE', 'Migration Certificate', false, false, 13),
    ('INCOME_CERTIFICATE', 'Income Certificate', true, false, 14),
    ('CASTE_CERTIFICATE', 'Caste Certificate', true, false, 15),
    ('OTHER', 'Other Document', false, false, 99)
ON CONFLICT (code) DO NOTHING;

-- ═══ 6. Indexes ═══
CREATE INDEX IF NOT EXISTS idx_documents_owner_type_id ON documents(owner_entity_type, owner_entity_id);
CREATE INDEX IF NOT EXISTS idx_documents_university ON documents(university_id);
CREATE INDEX IF NOT EXISTS idx_admission_workflows_uni_status ON admission_workflows(university_id, workflow_status);
CREATE INDEX IF NOT EXISTS idx_admission_workflows_student ON admission_workflows(student_profile_id);
CREATE INDEX IF NOT EXISTS idx_doc_access_logs_document ON document_access_logs(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_access_logs_accessed_by ON document_access_logs(accessed_by);
CREATE INDEX IF NOT EXISTS idx_student_profiles_encrypted_pii ON student_profiles USING GIN (encrypted_pii);
CREATE INDEX IF NOT EXISTS idx_student_profiles_niat_id ON student_profiles(niat_id);

-- ═══ 7. Row-Level Security (RLS) on sensitive tables ═══
-- Enable RLS on documents (Supabase enforces this at the DB level)
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Only authenticated users from same university can access documents
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE polname = 'documents_university_isolation') THEN
        CREATE POLICY documents_university_isolation ON documents
            FOR ALL
            USING (university_id IN (
                SELECT university_id FROM users WHERE id = current_setting('app.current_user_id', true)::uuid
            ));
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
