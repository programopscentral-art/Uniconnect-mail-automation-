import { db } from './client';

export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type TaskPriority = 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface Task {
    id: string;
    title: string;
    description: string | null;
    priority: TaskPriority;
    assignee_ids: string[]; // Updated for multi-assignee
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
    assignee_ids?: string[];
    assigned_by: string;
    university_id?: string;
    due_date?: string;
}) {
    const { assignee_ids = [], ...taskData } = data;

    const result = await db.query(
        `INSERT INTO tasks (title, description, priority, assigned_by, university_id, due_date)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
            taskData.title,
            (taskData.description && taskData.description.trim() !== '') ? taskData.description : null,
            taskData.priority || 'MEDIUM',
            taskData.assigned_by,
            (taskData.university_id && taskData.university_id !== '') ? taskData.university_id : null,
            (taskData.due_date && taskData.due_date !== '') ? taskData.due_date : null
        ]
    );
    const task = result.rows[0];

    if (assignee_ids.length > 0) {
        const values = assignee_ids.map((uid, idx) => `($1, $${idx + 2})`).join(', ');
        await db.query(
            `INSERT INTO task_assignees (task_id, user_id) VALUES ${values}`,
            [task.id, ...assignee_ids]
        );
    }

    return { ...task, assignee_ids } as Task;
}

export async function getTasks(filters: { assigned_to?: string; university_id?: string; status?: TaskStatus }) {
    const conditions: string[] = [];
    const params: any[] = [];
    let i = 1;

    if (filters.assigned_to) {
        conditions.push(`t.id IN (SELECT task_id FROM task_assignees WHERE user_id = $${i++})`);
        params.push(filters.assigned_to);
    }
    if (filters.university_id) {
        conditions.push(`t.university_id = $${i++}`);
        params.push(filters.university_id);
    }
    if (filters.status) {
        conditions.push(`t.status = $${i++}`);
        params.push(filters.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await db.query(
        `SELECT t.*, u_by.name as assigned_by_name, 
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
         ${where}
         GROUP BY t.id, u_by.name, u_by.email, univ.name, univ.short_name
         ORDER BY t.created_at DESC`,
        params
    );
    return result.rows.map(r => ({
        ...r,
        assignee_ids: r.assignees.map((a: any) => a.id)
    }));
}

export async function getTaskById(id: string) {
    const result = await db.query(
        `SELECT t.*, 
            COALESCE(
                json_agg(
                    json_build_object(
                        'id', u_to.id,
                        'status', ta.status
                    )
                ) FILTER (WHERE u_to.id IS NOT NULL),
                '[]'::json
            ) as assignees
         FROM tasks t
         LEFT JOIN task_assignees ta ON t.id = ta.task_id
         LEFT JOIN users u_to ON ta.user_id = u_to.id
         WHERE t.id = $1
         GROUP BY t.id`,
        [id]
    );
    if (!result.rows[0]) return null;
    const task = result.rows[0];
    return {
        ...task,
        assignee_ids: task.assignees.map((a: any) => a.id)
    } as Task & { assignees: Array<{ id: string, status: string }> };
}

export async function updateTask(id: string, data: { status?: TaskStatus; priority?: TaskPriority; title?: string; description?: string; start_date?: string; due_date?: string; assignee_ids?: string[]; assignee_id?: string; assignee_status?: TaskStatus }) {
    const { assignee_ids, assignee_id, assignee_status, ...updateData } = data;

    // 1. Update individual assignee status
    if (assignee_id && assignee_status) {
        await db.query(
            `UPDATE task_assignees SET status = $1 WHERE task_id = $2 AND user_id = $3`,
            [assignee_status, id, assignee_id]
        );

        // Check if all assignees are completed
        const { rows } = await db.query(
            `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed 
             FROM task_assignees WHERE task_id = $1`,
            [id]
        );
        const stats = rows[0];
        if (parseInt(stats.total) > 0 && stats.total === stats.completed) {
            updateData.status = 'COMPLETED';
        } else if (assignee_status === 'IN_PROGRESS' || assignee_status === 'PENDING') {
            // If someone moved back to pending/processing, the main task can't be 'COMPLETED'
            // We only downgrade from COMPLETED to IN_PROGRESS if it was COMPLETED
            const currentTask = await db.query(`SELECT status FROM tasks WHERE id = $1`, [id]);
            if (currentTask.rows[0]?.status === 'COMPLETED') {
                updateData.status = 'IN_PROGRESS';
            }
        }
    }

    // 2. Update main task data
    if (Object.keys(updateData).length > 0) {
        const fields: string[] = [];
        const values: any[] = [];
        let i = 1;

        Object.entries(updateData).forEach(([key, val]) => {
            fields.push(`${key} = $${i++}`);
            // Convert empty strings to null for specific fields
            if (['description', 'university_id', 'due_date'].includes(key) && val === '') {
                values.push(null);
            } else {
                values.push(val);
            }
        });

        values.push(id);
        await db.query(`UPDATE tasks SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${i}`, values);
    }

    // 3. Handle multi-assignee list updates
    if (assignee_ids !== undefined) {
        // ... same logic ...
        await db.query('DELETE FROM task_assignees WHERE task_id = $1', [id]);
        if (assignee_ids.length > 0) {
            const values = assignee_ids.map((uid, idx) => `($1, $${idx + 2})`).join(', ');
            await db.query(
                `INSERT INTO task_assignees (task_id, user_id) VALUES ${values}`,
                [id, ...assignee_ids]
            );
        }
    }
}

export async function deleteTask(id: string) {
    await db.query('DELETE FROM tasks WHERE id = $1', [id]);
}

export async function reassignTask(id: string, assigneeIds: string[]) {
    await db.query('DELETE FROM task_assignees WHERE task_id = $1', [id]);
    if (assigneeIds.length > 0) {
        const values = assigneeIds.map((uid, idx) => `($1, $${idx + 2})`).join(', ');
        await db.query(
            `INSERT INTO task_assignees (task_id, user_id) VALUES ${values}`,
            [id, ...assigneeIds]
        );
    }
}

export async function getTaskStats(universityId?: string, userId?: string) {
    const conditions: string[] = [];
    const params: any[] = [];
    let i = 1;

    if (universityId) {
        conditions.push(`university_id = $${i++}`);
        params.push(universityId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    let query = '';
    if (userId) {
        // Calculate stats based on INDIVIDUAL assignee status
        query = `
            SELECT 
                ta.status as status,
                COUNT(*) as count,
                SUM(CASE WHEN ta.status != 'COMPLETED' AND t.due_date < NOW() THEN 1 ELSE 0 END) as overdue_count
            FROM tasks t
            JOIN task_assignees ta ON t.id = ta.task_id
            ${whereClause} ${whereClause ? 'AND' : 'WHERE'} ta.user_id = $${i}
            GROUP BY ta.status
        `;
        params.push(userId);
    } else {
        // Calculate stats based on GLOBAL task status
        query = `
            SELECT 
                status,
                COUNT(*) as count,
                SUM(CASE WHEN status != 'COMPLETED' AND due_date < NOW() THEN 1 ELSE 0 END) as overdue_count
            FROM tasks 
            ${whereClause}
            GROUP BY status
        `;
    }

    const res = await db.query(query, params);

    const stats: Record<string, number> = { PENDING: 0, IN_PROGRESS: 0, COMPLETED: 0, CANCELLED: 0, OVERDUE: 0 };
    res.rows.forEach(r => {
        if (r.status) stats[r.status] = parseInt(r.count);
    });
    stats.OVERDUE = res.rows.reduce((acc, r) => acc + (parseInt(r.overdue_count) || 0), 0);

    return stats;
}

export async function getDayPlanReport(date: string, universityId?: string) {
    // ... same code ...
    const whereTasks = universityId ? `AND t.university_id = $2` : ``;
    const whereCampaigns = universityId ? `AND university_id = $2` : ``;
    const params = universityId ? [date, universityId] : [date];

    const taskStats = await db.query(
        `SELECT 
            u.name as user_name,
            COUNT(DISTINCT t.id) as total_tasks,
            COUNT(DISTINCT CASE WHEN ta.status = 'COMPLETED' THEN t.id END) as completed_tasks
         FROM tasks t
         JOIN task_assignees ta ON t.id = ta.task_id
         JOIN users u ON ta.user_id = u.id
         WHERE DATE(t.created_at) = $1 ${whereTasks}
         GROUP BY u.name`,
        [date, ...params.slice(1)]
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
        `SELECT DISTINCT t.*, u.email as user_email, u.name as user_name
         FROM tasks t
         JOIN task_assignees ta ON t.id = ta.task_id
         LEFT JOIN users u ON ta.user_id = u.id
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
