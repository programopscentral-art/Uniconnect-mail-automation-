import { db } from './client';

export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type TaskPriority = 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface Task {
    id: string;
    title: string;
    description: string | null;
    priority: TaskPriority;
    assigned_to: string | null;
    assigned_by: string | null;
    university_id: string | null;
    status: TaskStatus;
    due_date: Date | null;
    created_at: Date;
    updated_at: Date;
}

export async function createTask(data: {
    title: string;
    description?: string;
    priority?: TaskPriority;
    assigned_to?: string;
    assigned_by: string;
    university_id?: string;
    due_date?: string;
}) {
    const result = await db.query(
        `INSERT INTO tasks (title, description, priority, assigned_to, assigned_by, university_id, due_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [data.title, data.description || null, data.priority || 'MEDIUM', data.assigned_to || null, data.assigned_by, data.university_id || null, data.due_date || null]
    );
    return result.rows[0] as Task;
}

export async function getTasks(filters: { assigned_to?: string; university_id?: string; status?: TaskStatus }) {
    const conditions: string[] = [];
    const params: any[] = [];
    let i = 1;

    if (filters.assigned_to) {
        conditions.push(`assigned_to = $${i++}`);
        params.push(filters.assigned_to);
    }
    if (filters.university_id) {
        conditions.push(`t.university_id = $${i++}`); // Fix ambiguous column
        params.push(filters.university_id);
    }
    if (filters.status) {
        conditions.push(`status = $${i++}`);
        params.push(filters.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await db.query(
        `SELECT t.*, u_to.name as assigned_to_name, u_by.name as assigned_by_name, 
            univ.name as university_name, univ.short_name as university_short_name,
            u_to.email as assigned_to_email, u_by.email as assigned_by_email
         FROM tasks t
         LEFT JOIN users u_to ON t.assigned_to = u_to.id
         LEFT JOIN users u_by ON t.assigned_by = u_by.id
         LEFT JOIN universities univ ON t.university_id = univ.id
         ${where}
         ORDER BY t.created_at DESC`,
        params
    );
    return result.rows;
}

export async function updateTask(id: string, data: { status?: TaskStatus; priority?: TaskPriority; title?: string; description?: string; start_date?: string; due_date?: string; assigned_to?: string }) {
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;

    Object.entries(data).forEach(([key, val]) => {
        fields.push(`${key} = $${i++}`);
        values.push(val);
    });

    values.push(id);
    await db.query(`UPDATE tasks SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${i}`, values);
}

export async function deleteTask(id: string) {
    await db.query('DELETE FROM tasks WHERE id = $1', [id]);
}

export async function reassignTask(id: string, assignedTo: string | null) {
    await db.query(`UPDATE tasks SET assigned_to = $1, updated_at = NOW() WHERE id = $2`, [assignedTo, id]);
}

export async function getTaskStats(universityId?: string) {
    // ... existing stats code ...
    const whereClause = universityId ? `WHERE university_id = $1` : ``;
    const params = universityId ? [universityId] : [];

    const res = await db.query(
        `SELECT 
            status,
            COUNT(*) as count,
            SUM(CASE WHEN status = 'PENDING' AND due_date < NOW() THEN 1 ELSE 0 END) as overdue_count
         FROM tasks 
         ${whereClause}
         GROUP BY status`,
        params
    );

    const stats: Record<string, number> = { PENDING: 0, COMPLETED: 0, CANCELLED: 0, OVERDUE: 0 };
    res.rows.forEach(r => {
        stats[r.status] = parseInt(r.count);
    });
    // Overdue is implicit sum
    stats.OVERDUE = res.rows.reduce((acc, r) => acc + (parseInt(r.overdue_count) || 0), 0);

    return stats;
}

export async function getDayPlanReport(date: string, universityId?: string) {
    // ... same code ...
    const whereTasks = universityId ? `AND university_id = $2` : ``;
    const whereCampaigns = universityId ? `AND university_id = $2` : ``;
    const params = universityId ? [date, universityId] : [date];

    const taskStats = await db.query(
        `SELECT 
            u.name as user_name,
            COUNT(*) as total_tasks,
            SUM(CASE WHEN t.status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_tasks
         FROM tasks t
         JOIN users u ON t.assigned_to = u.id
         WHERE DATE(t.created_at) = $1 ${whereTasks}
         GROUP BY u.name`,
        params
    );

    const campaignStats = await db.query(
        `SELECT 
            SUM(sent_count) as total_sent,
            SUM(failed_count) as total_failed,
            SUM(open_count) as total_opened
         FROM campaigns
         WHERE DATE(started_at) = $1 ${whereCampaigns}`,
        params
    );

    return {
        date,
        user_reports: taskStats.rows.map(r => ({
            user_name: r.user_name,
            total_tasks: parseInt(r.total_tasks),
            completed_tasks: parseInt(r.completed_tasks)
        })),
        campaign_summary: {
            total_sent: parseInt(campaignStats.rows[0].total_sent) || 0,
            total_failed: parseInt(campaignStats.rows[0].total_failed) || 0,
            total_opened: parseInt(campaignStats.rows[0].total_opened) || 0
        }
    };
}

export async function getTasksDueSoon(hours: number = 1) {
    const result = await db.query(
        `SELECT t.*, u.email as user_email, u.name as user_name
         FROM tasks t
         LEFT JOIN users u ON t.assigned_to = u.id
         WHERE t.status IN ('PENDING', 'IN_PROGRESS')
           AND t.due_date IS NOT NULL
           AND t.due_date <= NOW() + ($1 * INTERVAL '1 hour')
           AND t.due_date > NOW()
           AND t.reminder_sent = false`,
        [hours]
    );
    return result.rows;
}

export async function markReminderSent(id: string) {
    await db.query(`UPDATE tasks SET reminder_sent = true WHERE id = $1`, [id]);
}
