
import { db } from './packages/shared/src/db/client';

async function cleanup() {
    try {
        console.log('--- STARTING DB CLEANUP ---');

        // 1. Mark all older tasks as "creation notified" to stop them from appearing on every check
        const markRes = await db.query(`
      UPDATE communication_tasks 
      SET creation_notified_at = created_at 
      WHERE creation_notified_at IS NULL AND created_at < NOW() - INTERVAL '30 minutes'
    `);
        console.log(`Cleaned up ${markRes.rowCount} old tasks stagnant 'creation_notified_at'`);

        // 2. Delete notifications that belong to tasks that no longer exist
        const deleteRes = await db.query(`
      DELETE FROM notifications n
      WHERE n.source_id LIKE 'CT_%'
      AND NOT EXISTS (
        SELECT 1 FROM communication_tasks ct 
        WHERE ct.id::text = split_part(n.source_id, '_', 2)
      )
    `);
        console.log(`Deleted ${deleteRes.rowCount} orphan task notifications`);

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

cleanup();
