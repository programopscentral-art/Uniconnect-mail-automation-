-- SME is examinations-only.
--
-- The initial SME seed (migration 0102) granted dashboard/tasks/assessments/
-- academic-operations, so SME users saw Dashboard, Task Center and Operations
-- Hub. SME should see ONLY Examinations. Reset its permissions to just
-- 'assessments'. (ensureCorePermissions is also updated in code to stop
-- re-adding dashboard/tasks to SME at boot.)

BEGIN;

UPDATE role_permissions
   SET features = '["assessments"]'::jsonb, updated_at = now()
 WHERE role = 'SME';

COMMIT;
