import { db } from './client';

export async function getMailLogs(options: {
    university_id?: string;
    limit?: number;
    offset?: number;
}) {
    let query = `
        SELECT 
            r.id,
            r.to_email,
            r.status,
            r.sent_at,
            r.opened_at,
            r.acknowledged_at,
            c.name as campaign_name,
            u.name as university_name,
            m.email as sender_email
        FROM campaign_recipients r
        JOIN campaigns c ON r.campaign_id = c.id
        JOIN universities u ON c.university_id = u.id
        JOIN mailbox_connections m ON c.mailbox_id = m.id
        WHERE r.status != 'PENDING'
    `;
    const params: any[] = [];

    if (options.university_id) {
        query += ` AND c.university_id = $${params.length + 1}`;
        params.push(options.university_id);
    }

    query += ` ORDER BY r.sent_at DESC NULLS LAST LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(options.limit || 50);
    params.push(options.offset || 0);

    const result = await db.query(query, params);
    return result.rows;
}

export async function getMailLogsCount(university_id?: string) {
    let query = `
        SELECT COUNT(*) 
        FROM campaign_recipients r
        JOIN campaigns c ON r.campaign_id = c.id
        WHERE r.status != 'PENDING'
    `;
    const params: any[] = [];

    if (university_id) {
        query += ` AND c.university_id = $1`;
        params.push(university_id);
    }

    const result = await db.query(query, params);
    return parseInt(result.rows[0].count);
}
