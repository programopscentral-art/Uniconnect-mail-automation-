-- PIN access control: only ADMIN/PROGRAM_OPS can set PINs and grant access to others
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_access_granted BOOLEAN DEFAULT FALSE;

-- Auto-grant PIN access to ADMIN and PROGRAM_OPS
UPDATE users SET pin_access_granted = TRUE WHERE role IN ('ADMIN', 'PROGRAM_OPS');
