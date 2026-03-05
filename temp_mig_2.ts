import { db } from './packages/shared/src/db/client';

(async () => {
    try {
        const tasks = await db.query(`SELECT * FROM communication_tasks WHERE status = 'Completed' AND (completions IS NULL OR jsonb_array_length(completions) = 0)`);
        for (const t of tasks.rows) {
            const comp = {
                user_id: 'system',
                user_name: 'Legacy Completion',
                user_email: 'legacy@system',
                university: t.universities.join(', '),
                completed_at: t.marked_sent_at || t.created_at || new Date()
            };
            await db.query(`UPDATE communication_tasks SET completions = $1::jsonb WHERE id = $2`, [JSON.stringify([comp]), t.id]);
        }
        console.log(`Migrated ${tasks.rows.length} legacy completed tasks.`);
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
})();
