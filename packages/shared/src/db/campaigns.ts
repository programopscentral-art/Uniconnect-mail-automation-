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
    if (students.length === 0) return { total: 0, skipped: 0, skippedStudents: [] };

    const client = await db.pool.connect();
    const skippedStudents: Array<{ id: string; name: string; email: string; external_id: string; reason: string }> = [];

    try {
        await client.query('BEGIN');

        // DEDUPLICATION: Ensure we don't add the same email twice in the same campaign
        const seenEmails = new Set<string>();

        // Chunking to avoid Postgres parameter limits
        const chunkSize = 500;
        for (let i = 0; i < students.length; i += chunkSize) {
            const chunk = students.slice(i, i + chunkSize);

            const uniqueChunk: any[] = [];
            for (const s of chunk) {
                let email = (s.email || '').toLowerCase().trim();

                if (recipientEmailKey) {
                    const custom = s.metadata?.[recipientEmailKey];
                    if (custom && typeof custom === 'string' && custom.trim().includes('@')) {
                        email = custom.toLowerCase().trim();
                    } else {
                        // Fallback to primary email instead of skipping
                        console.log(`[RECIPIENTS] Student ${s.name || s.id}: custom field "${recipientEmailKey}" missing/invalid, falling back to primary email: ${email}`);
                    }
                }

                if (!email || !email.includes('@')) {
                    skippedStudents.push({ id: s.id, name: s.name || 'N/A', email: s.email || '', external_id: s.external_id || '', reason: 'No valid email address' });
                    continue;
                }

                if (seenEmails.has(email)) {
                    skippedStudents.push({ id: s.id, name: s.name || 'N/A', email: email, external_id: s.external_id || '', reason: `Duplicate email (already added)` });
                    continue;
                }

                seenEmails.add(email);
                uniqueChunk.push(s);
            }

            if (uniqueChunk.length === 0) continue;

            const values: any[] = [];
            const placeholders = uniqueChunk.map((s, idx) => {
                const base = idx * 6;
                const token = crypto.randomBytes(16).toString('hex');
                let toEmail = s.email || '';

                if (recipientEmailKey) {
                    const custom = s.metadata?.[recipientEmailKey];
                    if (custom && typeof custom === 'string') toEmail = custom.trim();
                }

                values.push(campaignId, s.id, toEmail.toLowerCase().trim(), token, 'PENDING', null);
                return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
            }).join(', ');

            await client.query(
                `INSERT INTO campaign_recipients (campaign_id, student_id, to_email, tracking_token, status, error_message)
                 VALUES ${placeholders}
                 ON CONFLICT (campaign_id, student_id) DO NOTHING`,
                values
            );
        }

        // Also insert skipped students with SKIPPED status so they appear in recipient list.
        // Each insert is wrapped in a SAVEPOINT: if one fails (FK violation, bad data,
        // anything), only that single row rolls back — the outer transaction stays alive.
        // Without SAVEPOINTs, a single failure puts the whole txn into "aborted" state
        // and every subsequent query (including the stats SELECT and the campaigns UPDATE
        // below) silently fails with "current transaction is aborted".
        if (skippedStudents.length > 0) {
            for (const sk of skippedStudents) {
                const sp = `sp_skip_${crypto.randomBytes(4).toString('hex')}`;
                try {
                    await client.query(`SAVEPOINT ${sp}`);
                    await client.query(
                        `INSERT INTO campaign_recipients (campaign_id, student_id, to_email, tracking_token, status, error_message)
                         VALUES ($1, $2, $3, $4, 'SKIPPED', $5)
                         ON CONFLICT (campaign_id, student_id) DO NOTHING`,
                        [campaignId, sk.id, sk.email || '', crypto.randomBytes(16).toString('hex'), sk.reason]
                    );
                    await client.query(`RELEASE SAVEPOINT ${sp}`);
                } catch (e: any) {
                    try { await client.query(`ROLLBACK TO SAVEPOINT ${sp}`); } catch {}
                    console.warn(`[CAMPAIGN] skipped-row insert failed for ${sk.id}: ${e?.message?.slice(0, 120)}`);
                }
            }
        }

        // Recalculate total_recipients and failed_count for accuracy (exclude SKIPPED from total)
        const statsRes = await client.query(`
            SELECT
                COUNT(*) FILTER (WHERE status != 'SKIPPED') as total,
                COUNT(*) FILTER (WHERE status = 'FAILED') as failed,
                COUNT(*) FILTER (WHERE status = 'SKIPPED') as skipped
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

        if (skippedStudents.length > 0) {
            console.log(`[CAMPAIGN] ${campaignId}: ${skippedStudents.length} students skipped. Reasons:`,
                skippedStudents.reduce((acc, s) => { acc[s.reason] = (acc[s.reason] || 0) + 1; return acc; }, {} as Record<string, number>));
        }

        return { total: parseInt(total), skipped: skippedStudents.length, skippedStudents };
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

export async function getCampaignRecipients(campaignId: string, updatedSince?: Date) {
    let query = `SELECT r.*, s.name as student_name, s.external_id, s.metadata FROM campaign_recipients r LEFT JOIN students s ON r.student_id = s.id WHERE campaign_id = $1`;
    const params: any[] = [campaignId];

    if (updatedSince) {
        query += ` AND r.updated_at > $2`;
        params.push(updatedSince);
    }

    const result = await db.query(query, params);
    return result.rows;
}

export async function markRecipientOpen(token: string) {
    // Always record the open event (open_count + opened_at), but NEVER downgrade
    // a more-meaningful terminal status. ACKNOWLEDGED in particular: email clients
    // refetch tracking pixels (Gmail prefetches them once, then on each re-render),
    // so without this guard a student who ACKs and later re-views their email gets
    // silently flipped back to OPENED and disappears from the dashboard.
    // Same logic protects FAILED (don't reset a failed send to OPENED on a stray pixel).
    const res = await db.query(
        `UPDATE campaign_recipients
         SET status = CASE WHEN status IN ('ACKNOWLEDGED', 'FAILED') THEN status ELSE 'OPENED' END,
             opened_at = COALESCE(opened_at, NOW()),
             open_count = open_count + 1,
             updated_at = NOW()
         WHERE tracking_token = $1
         RETURNING id, campaign_id, open_count, status`,
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
         SET status = 'ACKNOWLEDGED', acknowledged_at = NOW(), updated_at = NOW() 
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

    const [statsRes, recentRes, dailyRes] = await Promise.all([
        db.query(
            `SELECT 
                COUNT(*) as total_campaigns,
                SUM(sent_count) as total_sent,
                SUM(open_count) as total_opened,
                SUM(ack_count) as total_acked,
                SUM(failed_count) as total_failed,
                SUM(total_recipients) as total_recipients
             FROM campaigns c ${whereClause}`,
            params
        ),
        db.query(
            `SELECT c.*, u.name as university_name, creator.name as creator_name, creator.email as creator_email
             FROM campaigns c
             JOIN universities u ON c.university_id = u.id
             LEFT JOIN users creator ON c.created_by_user_id = creator.id
             ${whereClause}
             ORDER BY c.created_at DESC
             LIMIT 5`,
            params
        ),
        db.query(
            `SELECT 
                DATE(started_at) as date,
                SUM(sent_count) as count
             FROM campaigns c
             ${universityId ? 'WHERE c.university_id = $1 AND c.started_at >= NOW() - INTERVAL \'30 days\'' : 'WHERE c.started_at >= NOW() - INTERVAL \'30 days\''}
    
             GROUP BY DATE(started_at)
             ORDER BY DATE(started_at) ASC`,
            params
        )
    ]);

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

export async function getDailySentCount(universityId?: string) {
    // Counts SENT, OPENED, ACKNOWLEDGED today (IST)
    let query = `
        SELECT COUNT(*) as count 
        FROM campaign_recipients r
        JOIN campaigns c ON r.campaign_id = c.id
        WHERE r.status IN ('SENT', 'OPENED', 'ACKNOWLEDGED') 
        AND r.sent_at >= CURRENT_DATE
    `;
    const params: any[] = [];

    if (universityId) {
        query += ` AND c.university_id = $1`;
        params.push(universityId);
    }

    const result = await db.query(query, params);
    return parseInt(result.rows[0].count) || 0;
}
