-- Per-user "Full Access (operational)" override.
--
-- When true, the user is granted every operational feature (budgeting, petty
-- cash, fee collection, assessments, meetings, sheets, ops-os, …) on top of
-- their normal role — WITHOUT the sensitive admin surfaces (Users, Permissions,
-- Universities, Mailboxes). Used for Central Team staff who need broad visibility
-- regardless of their operational role.

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS full_access boolean NOT NULL DEFAULT false;

COMMIT;
