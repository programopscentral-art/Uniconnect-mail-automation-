-- Add 11th class documents and remove bank/PAN/IFSC from PII

-- Add new document types for 11th class
INSERT INTO student_document_types (code, label, is_sensitive, is_required, sort_order) VALUES
    ('CERTIFICATE_11TH', '11th Certificate', false, false, 3),
    ('MARKSHEET_11TH', '11th Marksheet', false, false, 6),
    ('ADMISSION_RECEIPT', 'Admission Receipt', false, true, 11),
    ('HOSTEL_RECEIPT', 'Hostel Fee Receipt', false, false, 12),
    ('SCHOLARSHIP_LETTER', 'Scholarship Letter', false, false, 16)
ON CONFLICT (code) DO NOTHING;

-- Re-order sort for clean numbering
UPDATE student_document_types SET sort_order = 1 WHERE code = 'CERTIFICATE_10TH';
UPDATE student_document_types SET sort_order = 2 WHERE code = 'MARKSHEET_10TH';
UPDATE student_document_types SET sort_order = 3 WHERE code = 'CERTIFICATE_11TH';
UPDATE student_document_types SET sort_order = 4 WHERE code = 'MARKSHEET_11TH';
UPDATE student_document_types SET sort_order = 5 WHERE code = 'CERTIFICATE_12TH';
UPDATE student_document_types SET sort_order = 6 WHERE code = 'MARKSHEET_12TH';
UPDATE student_document_types SET sort_order = 7 WHERE code = 'DEGREE_CERTIFICATE';
UPDATE student_document_types SET sort_order = 8 WHERE code = 'TRANSFER_CERTIFICATE';
UPDATE student_document_types SET sort_order = 9 WHERE code = 'MIGRATION_CERTIFICATE';
UPDATE student_document_types SET sort_order = 10 WHERE code = 'ID_PROOF_AADHAAR';
UPDATE student_document_types SET sort_order = 11 WHERE code = 'PASSPORT_PHOTO';
UPDATE student_document_types SET sort_order = 12 WHERE code = 'SIGNATURE';
UPDATE student_document_types SET sort_order = 13 WHERE code = 'PAYMENT_RECEIPT';
UPDATE student_document_types SET sort_order = 14 WHERE code = 'ADMISSION_RECEIPT';
UPDATE student_document_types SET sort_order = 15 WHERE code = 'FEE_RECEIPT';
UPDATE student_document_types SET sort_order = 16 WHERE code = 'HOSTEL_RECEIPT';
UPDATE student_document_types SET sort_order = 17 WHERE code = 'INCOME_CERTIFICATE';
UPDATE student_document_types SET sort_order = 18 WHERE code = 'CASTE_CERTIFICATE';
UPDATE student_document_types SET sort_order = 19 WHERE code = 'SCHOLARSHIP_LETTER';
UPDATE student_document_types SET sort_order = 99 WHERE code = 'OTHER';

-- Remove PAN card from required doc types (keep as optional)
UPDATE student_document_types SET is_required = false WHERE code = 'ID_PROOF_PAN';
