-- Petty-cash uploaded files stored in the DB (base64), not on local disk.
--
-- Railway's filesystem is ephemeral and per-instance, so files written to
-- static/uploads are lost on every redeploy and invisible to other instances.
-- Bills, disbursement proofs and approval evidence must persist, so we store the
-- bytes in the database (mirroring the Budget Proposals attachments pattern) and
-- serve them from /api/petty-cash/file/[id].

BEGIN;

CREATE TABLE IF NOT EXISTS petty_cash_files (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    file_name text NOT NULL,
    file_type text,
    content_base64 text NOT NULL,
    uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now()
);

COMMIT;
