-- Admin handover: Pavan → Karthik.
--
-- pavan.dharma@nxtwave.tech is being removed from the admin function. All the
-- mails he used to receive (fee-collection snapshots, budget proposals, access
-- alerts, and any ADMIN/PROGRAM_OPS role-based reports) now go to
-- karthik@nxtwave.tech instead.
--
-- His hardcoded appearances in the recipient lists (fee_snapshot,
-- budget_proposals, access-alert) were replaced with karthik@nxtwave.tech in
-- code. Here we deactivate Pavan so he is also dropped from every role-based
-- recipient query (all of which filter is_active = true) and can no longer sign
-- in. Karthik is already an active ADMIN; the second statement just guarantees
-- it (idempotent).

BEGIN;

UPDATE users
   SET is_active = false, updated_at = now()
 WHERE lower(email) = 'pavan.dharma@nxtwave.tech';

UPDATE users
   SET role = 'ADMIN', is_active = true, updated_at = now()
 WHERE lower(email) = 'karthik@nxtwave.tech';

COMMIT;
