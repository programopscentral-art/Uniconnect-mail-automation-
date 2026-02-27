import { db } from './src/db/client.js';

async function profile() {
    const univId = '0b67ea9a-024b-4420-99cb-8134e35011c3';
    const subjId = '788c751d-69ff-4b5c-b833-bda8704605cd';

    const queries = {
        all_users_univ: [`SELECT u.*, 
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
        WHERE u.is_active = true AND (u.university_id = $1 OR uu.university_id = $1)
        GROUP BY u.id, u_univ.name ORDER BY u.created_at DESC`, [univId]],

        subject_questions: [`SELECT q.*, co.code as co_code 
                 FROM assessment_questions q
                 LEFT JOIN assessment_course_outcomes co ON q.co_id = co.id
                 JOIN assessment_units u ON q.unit_id = u.id
                 WHERE u.subject_id = $1
                 ORDER BY q.marks ASC, q.created_at DESC`, [subjId]],

        dashboard_stats_univ: [`SELECT 
                COUNT(*) as total_campaigns,
                SUM(sent_count) as total_sent,
                SUM(open_count) as total_opened,
                SUM(ack_count) as total_acked,
                SUM(failed_count) as total_failed,
                SUM(total_recipients) as total_recipients
             FROM campaigns c WHERE c.university_id = $1`, [univId]],

        dashboard_daily_activity: [`SELECT 
                DATE(started_at) as date,
                SUM(sent_count) as count
             FROM campaigns c
             WHERE c.university_id = $1 AND c.started_at >= NOW() - INTERVAL '30 days'
             GROUP BY DATE(started_at)
             ORDER BY DATE(started_at) ASC`, [univId]]
    };

    for (const [name, [sql, params]] of Object.entries(queries)) {
        console.log(`\n--- Profiling ${name} ---`);
        const start = Date.now();
        try {
            const res = await db.query(sql as string, params as any[]);
            console.log(`Rows returned: ${res.rowCount}`);
            const explain = await db.query(`EXPLAIN ANALYZE ${sql}`, params as any[]);
            console.log(explain.rows.map(r => r['QUERY PLAN']).join('\n'));
        } catch (e) {
            console.error(`Error profiling ${name}:`, e.message);
        }
        console.log(`Execution time: ${Date.now() - start}ms`);
    }
    process.exit(0);
}

profile();
