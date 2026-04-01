import { db } from './client';

/**
 * Get all team members with their aggregate performance metrics.
 * Used for the team overview / leaderboard view.
 */
export async function getTeamAnalytics(options: {
    universityId?: string;
    dateFrom?: string;
    dateTo?: string;
} = {}) {
    const conditions: string[] = ['u.is_active = true', "u.role != 'STUDENT'", "u.role != 'FACULTY'"];
    const params: any[] = [];
    let i = 1;

    if (options.universityId) {
        conditions.push(`(u.university_id = $${i} OR uu.university_id = $${i})`);
        params.push(options.universityId);
        i++;
    }

    let dateFilter = '';
    if (options.dateFrom) {
        dateFilter += ` AND ta2.completed_at >= $${i}::date`;
        params.push(options.dateFrom);
        i++;
    }
    if (options.dateTo) {
        dateFilter += ` AND ta2.completed_at <= ($${i}::date + INTERVAL '1 day')`;
        params.push(options.dateTo);
        i++;
    }

    // Main query: get all users with their task stats
    const query = `
        SELECT
            u.id,
            u.name,
            u.email,
            u.role,
            u.presence_status,
            u.last_active_at,
            u.profile_picture_url,
            u_univ.name as university_name,
            -- Total tasks assigned (all time for the user, but within date range for metrics)
            COALESCE(stats.total_assigned, 0) as total_assigned,
            COALESCE(stats.total_completed, 0) as total_completed,
            COALESCE(stats.total_in_progress, 0) as total_in_progress,
            COALESCE(stats.total_overdue, 0) as total_overdue,
            COALESCE(stats.avg_completion_hours, 0) as avg_completion_hours,
            COALESCE(stats.fastest_completion_hours, 0) as fastest_completion_hours,
            COALESCE(stats.tasks_completed_on_time, 0) as tasks_completed_on_time,
            COALESCE(stats.tasks_completed_late, 0) as tasks_completed_late,
            -- Streak: consecutive days with at least 1 completion
            COALESCE(streak.current_streak, 0) as current_streak
        FROM users u
        LEFT JOIN universities u_univ ON u.university_id = u_univ.id
        LEFT JOIN user_universities uu ON u.id = uu.user_id
        LEFT JOIN LATERAL (
            SELECT
                COUNT(*) as total_assigned,
                COUNT(*) FILTER (WHERE ta2.status = 'COMPLETED') as total_completed,
                COUNT(*) FILTER (WHERE ta2.status = 'IN_PROGRESS') as total_in_progress,
                COUNT(*) FILTER (WHERE ta2.status != 'COMPLETED' AND ta2.status != 'CANCELLED' AND t.due_date < NOW()) as total_overdue,
                AVG(EXTRACT(EPOCH FROM (ta2.completed_at - ta2.started_at))/3600)
                    FILTER (WHERE ta2.status = 'COMPLETED' AND ta2.started_at IS NOT NULL) as avg_completion_hours,
                MIN(EXTRACT(EPOCH FROM (ta2.completed_at - ta2.started_at))/3600)
                    FILTER (WHERE ta2.status = 'COMPLETED' AND ta2.started_at IS NOT NULL AND ta2.completed_at > ta2.started_at) as fastest_completion_hours,
                COUNT(*) FILTER (WHERE ta2.status = 'COMPLETED' AND (t.due_date IS NULL OR ta2.completed_at <= t.due_date)) as tasks_completed_on_time,
                COUNT(*) FILTER (WHERE ta2.status = 'COMPLETED' AND t.due_date IS NOT NULL AND ta2.completed_at > t.due_date) as tasks_completed_late
            FROM task_assignees ta2
            JOIN tasks t ON ta2.task_id = t.id
            WHERE ta2.user_id = u.id ${dateFilter}
        ) stats ON true
        LEFT JOIN LATERAL (
            SELECT COUNT(DISTINCT d.day) as current_streak
            FROM (
                SELECT DATE(ta3.completed_at) as day
                FROM task_assignees ta3
                WHERE ta3.user_id = u.id AND ta3.status = 'COMPLETED' AND ta3.completed_at IS NOT NULL
                AND ta3.completed_at >= NOW() - INTERVAL '30 days'
                ORDER BY day DESC
            ) d
            WHERE d.day >= (
                -- Find the first gap from today going backwards
                SELECT COALESCE(
                    (SELECT DATE(g.expected) FROM (
                        SELECT CURRENT_DATE - s.i as expected
                        FROM generate_series(0, 30) s(i)
                    ) g
                    WHERE g.expected NOT IN (
                        SELECT DATE(ta4.completed_at) FROM task_assignees ta4
                        WHERE ta4.user_id = u.id AND ta4.status = 'COMPLETED' AND ta4.completed_at IS NOT NULL
                    )
                    ORDER BY g.expected DESC LIMIT 1) + INTERVAL '1 day',
                    CURRENT_DATE - INTERVAL '30 days'
                )::date
            )
        ) streak ON true
        WHERE ${conditions.join(' AND ')}
        GROUP BY u.id, u.name, u.email, u.role, u.presence_status, u.last_active_at, u.profile_picture_url,
                 u_univ.name, stats.total_assigned, stats.total_completed, stats.total_in_progress,
                 stats.total_overdue, stats.avg_completion_hours, stats.fastest_completion_hours,
                 stats.tasks_completed_on_time, stats.tasks_completed_late, streak.current_streak
        ORDER BY stats.total_completed DESC NULLS LAST, u.name ASC
    `;

    const result = await db.query(query, params);
    return result.rows;
}

/**
 * Get detailed analytics for a single user — task breakdown, daily activity, speed metrics.
 */
export async function getUserDetailedAnalytics(userId: string, options: {
    dateFrom?: string;
    dateTo?: string;
} = {}) {
    const dateParams: any[] = [userId];
    let dateFilter = '';
    let i = 2;

    if (options.dateFrom) {
        dateFilter += ` AND t.created_at >= $${i}::date`;
        dateParams.push(options.dateFrom);
        i++;
    }
    if (options.dateTo) {
        dateFilter += ` AND t.created_at <= ($${i}::date + INTERVAL '1 day')`;
        dateParams.push(options.dateTo);
        i++;
    }

    // 1. User info
    const userResult = await db.query(
        `SELECT u.id, u.name, u.email, u.role, u.presence_status, u.last_active_at, u.profile_picture_url, u.created_at,
                univ.name as university_name
         FROM users u
         LEFT JOIN universities univ ON u.university_id = univ.id
         WHERE u.id = $1`,
        [userId]
    );
    const user = userResult.rows[0];
    if (!user) return null;

    // 2. Task summary stats
    const statsResult = await db.query(
        `SELECT
            COUNT(*) as total_assigned,
            COUNT(*) FILTER (WHERE ta.status = 'COMPLETED') as total_completed,
            COUNT(*) FILTER (WHERE ta.status = 'IN_PROGRESS') as total_in_progress,
            COUNT(*) FILTER (WHERE ta.status = 'PENDING') as total_pending,
            COUNT(*) FILTER (WHERE ta.status != 'COMPLETED' AND ta.status != 'CANCELLED' AND t.due_date < NOW()) as total_overdue,
            AVG(EXTRACT(EPOCH FROM (ta.completed_at - ta.started_at))/3600)
                FILTER (WHERE ta.status = 'COMPLETED' AND ta.started_at IS NOT NULL) as avg_completion_hours,
            MIN(EXTRACT(EPOCH FROM (ta.completed_at - ta.started_at))/3600)
                FILTER (WHERE ta.status = 'COMPLETED' AND ta.started_at IS NOT NULL AND ta.completed_at > ta.started_at) as fastest_completion_hours,
            MAX(EXTRACT(EPOCH FROM (ta.completed_at - ta.started_at))/3600)
                FILTER (WHERE ta.status = 'COMPLETED' AND ta.started_at IS NOT NULL) as slowest_completion_hours,
            COUNT(*) FILTER (WHERE ta.status = 'COMPLETED' AND (t.due_date IS NULL OR ta.completed_at <= t.due_date)) as on_time,
            COUNT(*) FILTER (WHERE ta.status = 'COMPLETED' AND t.due_date IS NOT NULL AND ta.completed_at > t.due_date) as late
         FROM task_assignees ta
         JOIN tasks t ON ta.task_id = t.id
         WHERE ta.user_id = $1 ${dateFilter}`,
        dateParams
    );

    // 3. Daily activity (last 30 days)
    const dailyResult = await db.query(
        `SELECT
            DATE(ta.completed_at) as day,
            COUNT(*) as completed_count,
            AVG(EXTRACT(EPOCH FROM (ta.completed_at - ta.started_at))/3600)
                FILTER (WHERE ta.started_at IS NOT NULL) as avg_hours
         FROM task_assignees ta
         JOIN tasks t ON ta.task_id = t.id
         WHERE ta.user_id = $1 AND ta.status = 'COMPLETED' AND ta.completed_at IS NOT NULL
         AND ta.completed_at >= NOW() - INTERVAL '30 days'
         GROUP BY DATE(ta.completed_at)
         ORDER BY day ASC`,
        [userId]
    );

    // 4. Task breakdown by priority
    const priorityResult = await db.query(
        `SELECT
            t.priority,
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE ta.status = 'COMPLETED') as completed,
            AVG(EXTRACT(EPOCH FROM (ta.completed_at - ta.started_at))/3600)
                FILTER (WHERE ta.status = 'COMPLETED' AND ta.started_at IS NOT NULL) as avg_hours
         FROM task_assignees ta
         JOIN tasks t ON ta.task_id = t.id
         WHERE ta.user_id = $1 ${dateFilter}
         GROUP BY t.priority
         ORDER BY CASE t.priority WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 WHEN 'LOW' THEN 4 END`,
        dateParams
    );

    // 5. Recent tasks (last 20)
    const recentResult = await db.query(
        `SELECT
            t.id, t.title, t.priority, t.status as task_status, t.due_date, t.estimated_time, t.created_at,
            ta.status as assignee_status, ta.started_at, ta.completed_at,
            CASE WHEN ta.started_at IS NOT NULL AND ta.completed_at IS NOT NULL
                 THEN EXTRACT(EPOCH FROM (ta.completed_at - ta.started_at))/3600
                 ELSE NULL END as hours_taken,
            u_by.name as assigned_by_name
         FROM task_assignees ta
         JOIN tasks t ON ta.task_id = t.id
         LEFT JOIN users u_by ON t.assigned_by = u_by.id
         WHERE ta.user_id = $1
         ORDER BY t.created_at DESC
         LIMIT 20`,
        [userId]
    );

    // 6. Recurring vs one-off task analysis
    // Tasks with similar titles (appearing 3+ times) are "recurring"
    const recurringResult = await db.query(
        `WITH task_titles AS (
            SELECT
                LOWER(TRIM(t.title)) as norm_title,
                COUNT(*) as occurrence_count,
                COUNT(*) FILTER (WHERE ta.status = 'COMPLETED') as completed_count,
                AVG(EXTRACT(EPOCH FROM (ta.completed_at - ta.started_at))/3600)
                    FILTER (WHERE ta.status = 'COMPLETED' AND ta.started_at IS NOT NULL) as avg_hours
            FROM task_assignees ta
            JOIN tasks t ON ta.task_id = t.id
            WHERE ta.user_id = $1
            GROUP BY LOWER(TRIM(t.title))
        )
        SELECT
            SUM(CASE WHEN occurrence_count >= 2 THEN occurrence_count ELSE 0 END) as recurring_tasks,
            SUM(CASE WHEN occurrence_count >= 2 THEN completed_count ELSE 0 END) as recurring_completed,
            AVG(CASE WHEN occurrence_count >= 2 THEN avg_hours ELSE NULL END) as recurring_avg_hours,
            SUM(CASE WHEN occurrence_count < 2 THEN occurrence_count ELSE 0 END) as unique_tasks,
            SUM(CASE WHEN occurrence_count < 2 THEN completed_count ELSE 0 END) as unique_completed,
            AVG(CASE WHEN occurrence_count < 2 THEN avg_hours ELSE NULL END) as unique_avg_hours
         FROM task_titles`,
        [userId]
    );

    // 7. Weekly trend (last 8 weeks)
    const weeklyResult = await db.query(
        `SELECT
            DATE_TRUNC('week', ta.completed_at) as week_start,
            COUNT(*) as completed_count,
            AVG(EXTRACT(EPOCH FROM (ta.completed_at - ta.started_at))/3600)
                FILTER (WHERE ta.started_at IS NOT NULL) as avg_hours
         FROM task_assignees ta
         WHERE ta.user_id = $1 AND ta.status = 'COMPLETED' AND ta.completed_at IS NOT NULL
         AND ta.completed_at >= NOW() - INTERVAL '8 weeks'
         GROUP BY DATE_TRUNC('week', ta.completed_at)
         ORDER BY week_start ASC`,
        [userId]
    );

    // 8. Communication tasks stats
    const commResult = await db.query(
        `SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE ct.status = 'Completed') as completed
         FROM communication_tasks ct
         WHERE $1 = ANY(ct.assigned_to)`,
        [userId]
    );

    const stats = statsResult.rows[0];

    return {
        user,
        stats: {
            total_assigned: parseInt(stats.total_assigned) || 0,
            total_completed: parseInt(stats.total_completed) || 0,
            total_in_progress: parseInt(stats.total_in_progress) || 0,
            total_pending: parseInt(stats.total_pending) || 0,
            total_overdue: parseInt(stats.total_overdue) || 0,
            avg_completion_hours: parseFloat(stats.avg_completion_hours) || 0,
            fastest_completion_hours: parseFloat(stats.fastest_completion_hours) || 0,
            slowest_completion_hours: parseFloat(stats.slowest_completion_hours) || 0,
            on_time: parseInt(stats.on_time) || 0,
            late: parseInt(stats.late) || 0,
        },
        daily_activity: dailyResult.rows.map(r => ({
            day: r.day,
            completed: parseInt(r.completed_count) || 0,
            avg_hours: parseFloat(r.avg_hours) || 0,
        })),
        priority_breakdown: priorityResult.rows.map(r => ({
            priority: r.priority,
            total: parseInt(r.total) || 0,
            completed: parseInt(r.completed) || 0,
            avg_hours: parseFloat(r.avg_hours) || 0,
        })),
        recent_tasks: recentResult.rows.map(r => ({
            ...r,
            hours_taken: r.hours_taken ? parseFloat(r.hours_taken) : null,
        })),
        task_types: {
            recurring: parseInt(recurringResult.rows[0]?.recurring_tasks) || 0,
            recurring_completed: parseInt(recurringResult.rows[0]?.recurring_completed) || 0,
            recurring_avg_hours: parseFloat(recurringResult.rows[0]?.recurring_avg_hours) || 0,
            unique: parseInt(recurringResult.rows[0]?.unique_tasks) || 0,
            unique_completed: parseInt(recurringResult.rows[0]?.unique_completed) || 0,
            unique_avg_hours: parseFloat(recurringResult.rows[0]?.unique_avg_hours) || 0,
        },
        weekly_trend: weeklyResult.rows.map(r => ({
            week_start: r.week_start,
            completed: parseInt(r.completed_count) || 0,
            avg_hours: parseFloat(r.avg_hours) || 0,
        })),
        communication_tasks: {
            total: parseInt(commResult.rows[0]?.total) || 0,
            completed: parseInt(commResult.rows[0]?.completed) || 0,
        },
    };
}
