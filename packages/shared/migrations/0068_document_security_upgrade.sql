-- Upgrade document security: encrypt ALL documents, add integrity hashing

-- Add SHA-256 integrity hash column for tamper detection
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_hash TEXT;

-- Add encryption metadata
ALTER TABLE documents ADD COLUMN IF NOT EXISTS encryption_algorithm TEXT DEFAULT 'AES-256-GCM';

-- Track who last accessed/downloaded (quick reference)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS access_count INTEGER DEFAULT 0;

-- Mark ALL existing documents as needing encryption (batch job can pick these up)
-- Going forward, every document will be encrypted regardless of sensitivity
COMMENT ON COLUMN documents.is_encrypted IS 'All documents are now encrypted at rest. Legacy unencrypted docs may exist.';

-- Make ALL document types sensitive (all get encrypted)
UPDATE student_document_types SET is_sensitive = true;

-- Add index for faster access log queries
CREATE INDEX IF NOT EXISTS idx_doc_access_logs_accessed_by ON document_access_logs(accessed_by);
CREATE INDEX IF NOT EXISTS idx_doc_access_logs_created_at ON document_access_logs(created_at DESC);

-- Add index for hash lookups (duplicate detection)
CREATE INDEX IF NOT EXISTS idx_documents_file_hash ON documents(file_hash) WHERE file_hash IS NOT NULL;
