-- Fix: make document_id nullable in document_access_logs
-- PII access logs don't have a document_id, so the FK constraint blocks them
ALTER TABLE document_access_logs ALTER COLUMN document_id DROP NOT NULL;

-- Drop the existing FK constraint and re-add with nullable support
ALTER TABLE document_access_logs DROP CONSTRAINT IF EXISTS document_access_logs_document_id_fkey;
ALTER TABLE document_access_logs
    ADD CONSTRAINT document_access_logs_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;
