-- Fix: Change campaign_recipients.student_id FK from CASCADE to SET NULL
-- Root cause: When users click "Clear Data" on Students page to re-upload,
-- ON DELETE CASCADE was destroying all campaign recipient history.
-- With SET NULL, deleting students preserves campaign history (student_name comes from LEFT JOIN).

ALTER TABLE campaign_recipients DROP CONSTRAINT IF EXISTS campaign_recipients_student_id_fkey;
ALTER TABLE campaign_recipients ALTER COLUMN student_id DROP NOT NULL;
ALTER TABLE campaign_recipients ADD CONSTRAINT campaign_recipients_student_id_fkey
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL;
