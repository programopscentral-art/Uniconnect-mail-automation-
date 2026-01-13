import { db } from './client';
import crypto from 'crypto';

export interface Campaign {
    id: string;
    university_id: string;
    name: string;
    template_id: string;
    mailbox_id: string;
    recipient_email_key: string | null;
    status: 'DRAFT' | 'SCHEDULED' | 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'STOPPED';
    include_ack: boolean;
    scheduled_at: Date | null;
    started_at: Date | null;
    completed_at: Date | null;
    total_recipients: number;
    sent_count: number;
    open_count: number;
    ack_count: number;
    failed_count: number;
}

export async function createCampaign(data: {
    university_id: string;
    name: string;
    template_id: string;
    mailbox_id: string;
    created_by_user_id: string;
    recipient_email_key?: string;
    include_ack?: boolean;
}) {
    const result = await db.query(
        `INSERT INTO campaigns (university_id, name, template_id, mailbox_id, created_by_user_id, recipient_email_key, include_ack)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
            data.university_id,
            data.name,
            data.template_id,
            data.mailbox_id,
            data.created_by_user_id,
            data.recipient_email_key || null,
            data.include_ack !== undefined ? data.include_ack : true
        ]
    );
    return result.rows[0] as Campaign;
}

export async function getCampaigns(universityId?: string) {
    const whereClause = universityId ? `WHERE c.university_id = $1` : ``;
    const params = universityId ? [universityId] : [];

    const result = await db.query(
        `SELECT c.*, t.name as template_name, m.email as mailbox_email 
         FROM campaigns c
         JOIN templates t ON c.template_id = t.id
         JOIN mailbox_connections m ON c.mailbox_id = m.id
         ${whereClause}
         ORDER BY c.created_at DESC`,
        params
    );
    return result.rows;
}

export async function getCampaignById(id: string) {
    const result = await db.query(`SELECT * FROM campaigns WHERE id = $1`, [id]);
    return result.rows[0] as Campaign | null;
}

// ... existing code ...
export async function deleteCampaign(id: string) {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM campaign_recipients WHERE campaign_id = $1', [id]);
        await client.query('DELETE FROM campaigns WHERE id = $1', [id]);
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}


// Bulk Insert Recipients
export async function createRecipients(campaignId: string, students: any[], recipientEmailKey?: string | null) {
    if (students.length === 0) return;

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        for (const s of students) {
            const token = crypto.randomBytes(16).toString('hex');
            let toEmail = s.email;
            let status = 'PENDING';
            let errorMessage = null;

            // If recipientEmailKey is provided, we MUST use it. 
            if (recipientEmailKey) {
                const customEmail = s.metadata?.[recipientEmailKey];
                if (!customEmail || typeof customEmail !== 'string' || !customEmail.trim().includes('@')) {
                    status = 'FAILED';
                    errorMessage = `Missing or invalid email in column: ${recipientEmailKey}`;
                    toEmail = 'invalid-email'; // Placeholder for DB constraint
                } else {
                    toEmail = customEmail.trim();
                }
            }

            if (status !== 'FAILED' && (!toEmail || !toEmail.includes('@'))) {
                status = 'FAILED';
                errorMessage = 'Invalid or missing primary email';
                toEmail = 'invalid-email';
            }

            await client.query(
                `INSERT INTO campaign_recipients (campaign_id, student_id, to_email, tracking_token, status, error_message)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (campaign_id, student_id) DO NOTHING`,
                [campaignId, s.id, toEmail.toLowerCase(), token, status, errorMessage]
            );
        }

        // Recalculate total_recipients and failed_count for accuracy
        const statsRes = await client.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'FAILED') as failed
            FROM campaign_recipients 
            WHERE campaign_id = $1
        `, [campaignId]);

        const { total, failed } = statsRes.rows[0];

        await client.query(
            `UPDATE campaigns 
             SET total_recipients = $1, failed_count = $2, status = 'SCHEDULED', scheduled_at = NOW() 
             WHERE id = $3`,
            [parseInt(total), parseInt(failed), campaignId]
        );

        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

export async function updateCampaignRecipientEmail(id: string, email: string) {
    const { rows } = await db.query(
        `UPDATE campaign_recipients 
         SET to_email = $1, status = 'QUEUED', error_message = NULL, updated_at = NOW() 
         WHERE id = $2 RETURNING *`,
        [email.toLowerCase().trim(), id]
    );
    return rows[0];
}

export async function getCampaignRecipients(campaignId: string) {
    const result = await db.query(`SELECT r.*, s.name as student_name, s.external_id FROM campaign_recipients r LEFT JOIN students s ON r.student_id = s.id WHERE campaign_id = $1`, [campaignId]);
    return result.rows;
}

export async function markRecipientOpen(token: string) {
    const res = await db.query(
        `UPDATE campaign_recipients 
         SET status = 'OPENED', opened_at = NOW(), open_count = open_count + 1 
         WHERE tracking_token = $1 RETURNING id, campaign_id, open_count`,
        [token]
    );
    if (res.rows[0] && res.rows[0].open_count === 1) {
        // Only increment campaign open count on first open
        await db.query(`UPDATE campaigns SET open_count = open_count + 1 WHERE id = $1`, [res.rows[0].campaign_id]);
    }
    return res.rows[0];
}

export async function markRecipientAck(token: string) {
    const res = await db.query(
        `UPDATE campaign_recipients 
         SET status = 'ACKNOWLEDGED', acknowledged_at = NOW() 
         WHERE tracking_token = $1 AND status != 'ACKNOWLEDGED'
         RETURNING id, campaign_id`,
        [token]
    );
    if (res.rows[0]) {
        await db.query(`UPDATE campaigns SET ack_count = ack_count + 1 WHERE id = $1`, [res.rows[0].campaign_id]);
    }
    return res.rows[0];
}

export async function getDashboardStats(universityId?: string) {
    const whereClause = universityId ? `WHERE c.university_id = $1` : ``;
    const params = universityId ? [universityId] : [];

    const statsRes = await db.query(
        `SELECT 
            COUNT(*) as total_campaigns,
            SUM(sent_count) as total_sent,
            SUM(open_count) as total_opened,
            SUM(ack_count) as total_acked,
            SUM(failed_count) as total_failed,
            SUM(total_recipients) as total_recipients
         FROM campaigns c ${whereClause}`,
        params
    );

    const recentRes = await db.query(
        `SELECT c.*, u.name as university_name, creator.name as creator_name, creator.email as creator_email
         FROM campaigns c
         JOIN universities u ON c.university_id = u.id
         LEFT JOIN users creator ON c.created_by_user_id = creator.id
         ${whereClause}
         ORDER BY c.created_at DESC
         LIMIT 5`,
        params
    );

    // Fetch daily activity for the last 30 days
    const dailyRes = await db.query(
        `SELECT 
            DATE(started_at) as date,
            SUM(sent_count) as count
         FROM campaigns c
         ${universityId ? 'WHERE c.university_id = $1 AND c.started_at >= NOW() - INTERVAL \'30 days\'' : 'WHERE c.started_at >= NOW() - INTERVAL \'30 days\''}

         GROUP BY DATE(started_at)
         ORDER BY DATE(started_at) ASC`,
        params
    );

    const s = statsRes.rows[0];
    return {
        total_campaigns: parseInt(s.total_campaigns) || 0,
        total_sent: parseInt(s.total_sent) || 0,
        total_opened: parseInt(s.total_opened) || 0,
        total_acked: parseInt(s.total_acked) || 0,
        total_failed: parseInt(s.total_failed) || 0,
        total_recipients: parseInt(s.total_recipients) || 0,
        recent_campaigns: recentRes.rows,
        daily_activity: dailyRes.rows.map(r => ({
            date: r.date,
            count: parseInt(r.count) || 0
        }))
    };
}
