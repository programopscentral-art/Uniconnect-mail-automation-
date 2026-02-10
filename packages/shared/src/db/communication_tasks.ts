import { db } from './client';

export type CommunicationChannel =
    | 'WhatsApp - Students'
    | 'WhatsApp - Parents'
    | 'Student App'
    | 'Parent App'
    | 'Email';

export type CommunicationPriority = 'Low' | 'Normal' | 'High';
export type CommunicationStatus = 'Scheduled' | 'Notified' | 'Completed' | 'Canceled';

export type CommunicationUpdateType = 'Announcement' | 'Reminder' | 'Event Campaign' | 'Positive Message' | 'Other';
export type CommunicationTeam = 'Student Engagement' | 'Parent Communication';
export type CommunicationContentType = 'Markdown' | 'Plain Text';

export interface CommunicationTask {
    id: string;
    universities: string[];
    channel: CommunicationChannel;
    assigned_to: string[];
    message_title: string;
    message_body: string;
    scheduled_at: Date;
    priority: CommunicationPriority;
    status: CommunicationStatus;
    notified_at: Date | null;
    marked_sent_at: Date | null;
    notes: string | null;
    created_by: string;
    created_at: Date;
    update_type: CommunicationUpdateType;
    team: CommunicationTeam | null;
    content_type: CommunicationContentType;
    link: string | null;
    creation_notified_at: Date | null;
    day_start_notified_at: Date | null;
    ten_min_reminder_sent: boolean;
}

export async function createCommunicationTask(data: {
    universities: string[];
    channel: CommunicationChannel;
    assigned_to: string[];
    message_title: string;
    message_body: string;
    scheduled_at: Date;
    priority?: CommunicationPriority;
    notes?: string;
    created_by: string;
    update_type?: CommunicationUpdateType;
    team?: CommunicationTeam;
    content_type?: CommunicationContentType;
    link?: string;
}) {
    const result = await db.query(
        `INSERT INTO communication_tasks 
        (universities, channel, assigned_to, message_title, message_body, scheduled_at, priority, notes, created_by, update_type, team, content_type, link)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
        [
            data.universities,
            data.channel,
            data.assigned_to,
            data.message_title,
            data.message_body,
            data.scheduled_at,
            data.priority || 'Normal',
            data.notes || null,
            data.created_by,
            data.update_type || 'Announcement',
            data.team || null,
            data.content_type || 'Plain Text',
            data.link || null
        ]
    );
    return result.rows[0] as CommunicationTask;
}

export async function getCommunicationTasks(userId?: string) {
    let query = `
        SELECT ct.*,
               (SELECT COALESCE(json_agg(COALESCE(u.short_name, u.name)), '[]'::json)
                FROM universities u
                WHERE u.id::text = ANY(ct.universities)
                   OR u.name = ANY(ct.universities)
                   OR u.short_name = ANY(ct.universities)
               ) as university_names
        FROM communication_tasks ct`;
    const params = [];

    if (userId) {
        query += ` WHERE ct.assigned_to @> ARRAY[$1]::uuid[]`;
        params.push(userId);
    }

    query += ` ORDER BY ct.created_at DESC`;

    const result = await db.query(query, params);
    return result.rows.map(row => ({
        ...row,
        // Fallback to original universities list if resolving names failed for some reason
        resolved_universities: row.university_names && row.university_names.length > 0 ? row.university_names : row.universities
    }));
}

export async function getCommunicationTaskById(id: string) {
    const result = await db.query(`
        SELECT ct.*,
               (SELECT COALESCE(json_agg(COALESCE(u.short_name, u.name)), '[]'::json)
                FROM universities u
                WHERE u.id::text = ANY(ct.universities)
                   OR u.name = ANY(ct.universities)
                   OR u.short_name = ANY(ct.universities)
               ) as university_names
        FROM communication_tasks ct
        WHERE ct.id = $1`, [id]);

    if (!result.rows[0]) return undefined;

    const row = result.rows[0];
    return {
        ...row,
        resolved_universities: row.university_names && row.university_names.length > 0 ? row.university_names : row.universities
    };
}

export async function deleteCommunicationTask(id: string) {
    await db.query(`DELETE FROM communication_tasks WHERE id = $1`, [id]);
}

export async function updateCommunicationTaskStatus(id: string, status: CommunicationStatus, notifiedAt?: Date, markedSentAt?: Date) {
    const updates: string[] = [`status = $2`];
    const params: any[] = [id, status];

    if (notifiedAt) {
        updates.push(`notified_at = $${params.length + 1}`);
        params.push(notifiedAt);
    }

    if (markedSentAt) {
        updates.push(`marked_sent_at = $${params.length + 1}`);
        params.push(markedSentAt);
    }

    const query = `UPDATE communication_tasks SET ${updates.join(', ')} WHERE id = $1 RETURNING *`;
    const result = await db.query(query, params);
    return result.rows[0] as CommunicationTask;
}

// User FCM Token functions
export async function registerFcmToken(userId: string, token: string, deviceInfo?: any) {
    await db.query(
        `INSERT INTO user_fcm_tokens (user_id, fcm_token, device_info, last_active)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (fcm_token) DO UPDATE SET last_active = NOW(), device_info = $3`,
        [userId, token, deviceInfo || null]
    );
}

export async function getUserFcmTokens(userId: string) {
    const result = await db.query(`SELECT fcm_token FROM user_fcm_tokens WHERE user_id = $1`, [userId]);
    return result.rows.map(r => r.fcm_token) as string[];
}

export async function updateCommunicationTask(id: string, data: {
    universities?: string[];
    channel?: CommunicationChannel;
    assigned_to?: string[];
    message_title?: string;
    message_body?: string;
    scheduled_at?: Date;
    priority?: CommunicationPriority;
    notes?: string;
    update_type?: CommunicationUpdateType;
    team?: CommunicationTeam;
    content_type?: CommunicationContentType;
    link?: string;
}) {
    const sets: string[] = [];
    const params: any[] = [id];

    Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined) {
            sets.push(`${key} = $${params.length + 1}`);
            params.push(value);
        }
    });

    // Reset notification flags when updated so people get re-notified if content changed
    sets.push(`creation_notified_at = NULL`);
    sets.push(`day_start_notified_at = NULL`);
    sets.push(`ten_min_reminder_sent = false`);

    const query = `UPDATE communication_tasks SET ${sets.join(', ')} WHERE id = $1 RETURNING *`;
    const result = await db.query(query, params);
    return result.rows[0] as CommunicationTask;
}

export async function getDueCommunicationTasks() {
    const result = await db.query(
        `SELECT * FROM communication_tasks 
         WHERE scheduled_at <= NOW() AND status = 'Scheduled'`
    );
    return result.rows as CommunicationTask[];
}

export async function getCommunicationTasksForReminders() {
    // Fetch tasks that:
    // 1. Need creation notification
    // 2. Need day-start notification (is today)
    // 3. Need 10-min notification (due within next 12 mins)
    // 4. Are due now
    const result = await db.query(
        `SELECT * FROM communication_tasks 
         WHERE (creation_notified_at IS NULL)
            OR (status = 'Scheduled' AND day_start_notified_at IS NULL AND DATE(scheduled_at) = CURRENT_DATE)
            OR (status = 'Scheduled' AND ten_min_reminder_sent = false AND scheduled_at <= NOW() + INTERVAL '12 minutes' AND scheduled_at > NOW())
            OR (status = 'Scheduled' AND scheduled_at <= NOW())`
    );
    return result.rows as CommunicationTask[];
}
