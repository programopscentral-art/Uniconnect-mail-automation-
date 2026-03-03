import { db } from './packages/shared/src/db/client';

(async () => {
    try {
        const res = await db.query('SELECT id, status, message_title, completions FROM communication_tasks ORDER BY created_at DESC LIMIT 10');
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
})();
