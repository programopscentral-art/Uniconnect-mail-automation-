import { db } from './packages/shared/src/db/client';

(async () => {
    try {
        const tasks = await db.query(`
        SELECT ct.*,
               (SELECT COALESCE(json_agg(COALESCE(u.short_name, u.name)), '[]'::json)
                FROM universities u
                WHERE u.id::text = ANY(ct.universities)
                   OR u.name = ANY(ct.universities)
                   OR u.short_name = ANY(ct.universities)
               ) as university_names
        FROM communication_tasks ct
        WHERE status = 'Completed'`);

        for (const row of tasks.rows) {
            const resolvedUnies = row.university_names && row.university_names.length > 0 ? row.university_names : row.universities;
            const comp = {
                user_id: 'system',
                user_name: 'Legacy Completion',
                user_email: 'System Administrator',
                university: resolvedUnies.join(', '),
                completed_at: row.marked_sent_at || row.created_at || new Date()
            };
            await db.query(`UPDATE communication_tasks SET completions = $1::jsonb WHERE id = $2`, [JSON.stringify([comp]), row.id]);
        }
        console.log(`Migrated ${tasks.rows.length} legacy completed tasks with correct names.`);
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
})();
