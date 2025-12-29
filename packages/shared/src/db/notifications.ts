import { db } from './client';

export type NotificationType = 'ACCESS_REQUEST' | 'DEADLINE_REMINDER' | 'CAMPAIGN_UPDATE' | 'SYSTEM';

export interface Notification {
    id: string;
    user_id: string;
    university_id: string | null;
    title: string;
    message: string;
    type: NotificationType;
    link: string | null;
    is_read: boolean;
    created_at: Date;
}

export async function createNotification(data: {
    user_id: string;
    university_id?: string | null;
    title: string;
    message: string;
    type: NotificationType;
    link?: string | null;
}) {
    const result = await db.query(
        `INSERT INTO notifications (user_id, university_id, title, message, type, link)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [data.user_id, data.university_id || null, data.title, data.message, data.type, data.link || null]
    );
    return result.rows[0] as Notification;
}

export async function getNotifications(userId: string) {
    const result = await db.query(
        `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [userId]
    );
    return result.rows as Notification[];
}

export async function markAsRead(id: string) {
    await db.query(`UPDATE notifications SET is_read = true WHERE id = $1`, [id]);
}

export async function getUnreadCount(userId: string) {
    const result = await db.query(
        `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false`,
        [userId]
    );
    return parseInt(result.rows[0].count);
}
