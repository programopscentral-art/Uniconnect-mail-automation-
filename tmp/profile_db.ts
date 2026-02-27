import { db } from './packages/shared/src/db/client';

async function profile() {
    const queries = {
        dashboard_stats: `SELECT 
                COUNT(*) as total_campaigns,
                SUM(sent_count) as total_sent,
                SUM(open_count) as total_opened,
                SUM(ack_count) as total_acked,
                SUM(failed_count) as total_failed,
                SUM(total_recipients) as total_recipients
             FROM campaigns c`,
        all_users: `SELECT u.*, 
           u_univ.name as university_name,
           COALESCE(
               json_agg(
                   json_build_object('id', uu_univ.id, 'name', uu_univ.name, 'is_team', uu_univ.is_team)
               ) FILTER (WHERE uu_univ.id IS NOT NULL),
               '[]'::json
           ) as universities
    FROM users u 
    LEFT JOIN universities u_univ ON u.university_id = u_univ.id
    LEFT JOIN user_universities uu ON u.id = uu.user_id
    LEFT JOIN universities uu_univ ON uu.university_id = uu_univ.id
    WHERE u.is_active = true
    GROUP BY u.id, u_univ.name ORDER BY u.created_at DESC`,
        tasks: `SELECT t.*, u_by.name as assigned_by_name, 
            univ.name as university_name, univ.short_name as university_short_name,
            u_by.email as assigned_by_email,
            COALESCE(
                json_agg(
                    json_build_object(
                        'id', u_to.id, 
                        'name', u_to.name, 
                        'email', u_to.email,
                        'status', ta.status,
                        'presence_status', u_to.presence_status,
                        'last_active_at', u_to.last_active_at
                    )
                ) FILTER (WHERE u_to.id IS NOT NULL),
                '[]'::json
            ) as assignees
         FROM tasks t
         LEFT JOIN task_assignees ta ON t.id = ta.task_id
         LEFT JOIN users u_to ON ta.user_id = u_to.id
         LEFT JOIN users u_by ON t.assigned_by = u_by.id
         LEFT JOIN universities univ ON t.university_id = univ.id
         GROUP BY t.id, u_by.name, u_by.email, univ.name, univ.short_name
         ORDER BY t.created_at DESC`
    };

    for (const [name, sql] of Object.entries(queries)) {
        console.log(`\n--- Profiling ${name} ---`);
        const start = Date.now();
        try {
            const explain = await db.query(`EXPLAIN ANALYZE ${sql}`);
            console.log(explain.rows.map(r => r['QUERY PLAN']).join('\n'));
        } catch (e) {
            console.error(`Error profiling ${name}:`, e.message);
        }
        console.log(`Execution time: ${Date.now() - start}ms`);
    }
    process.exit(0);
}

profile();
