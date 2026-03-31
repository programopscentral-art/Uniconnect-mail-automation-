import { db } from './client';

export interface MailboxConnection {
    id: string;
    university_id: string;
    email: string;
    status: 'ACTIVE' | 'REVOKED';
    created_at: Date;
}

export async function getMailboxes(universityId: string) {
    const result = await db.query(
        `SELECT mc.id, mc.university_id, mc.email, mc.status, mc.created_at,
                u.name as university_name
         FROM mailbox_connections mc
         LEFT JOIN universities u ON u.id = mc.university_id
         WHERE mc.university_id = $1
         ORDER BY mc.created_at DESC`,
        [universityId]
    );
    return result.rows;
}

export async function getAllMailboxes() {
    const result = await db.query(
        `SELECT mc.id, mc.university_id, mc.email, mc.status, mc.created_at,
                u.name as university_name
         FROM mailbox_connections mc
         LEFT JOIN universities u ON u.id = mc.university_id
         ORDER BY mc.created_at DESC`
    );
    return result.rows;
}

export async function createMailbox(data: {
    university_id: string;
    email: string;
    refresh_token_enc: string;
    scopes: string;
}) {
    const result = await db.query(
        `INSERT INTO mailbox_connections (university_id, email, refresh_token_enc, scopes, status)
         VALUES ($1, $2, $3, $4, 'ACTIVE')
         ON CONFLICT (university_id, email) DO UPDATE SET
            refresh_token_enc = EXCLUDED.refresh_token_enc,
            scopes = EXCLUDED.scopes,
            status = 'ACTIVE',
            updated_at = NOW()
         RETURNING id, university_id, email, status, created_at`,
        [data.university_id, data.email, data.refresh_token_enc, data.scopes]
    );
    return result.rows[0] as MailboxConnection;
}

// Internal use for worker
export async function getMailboxCredentials(id: string) {
    const result = await db.query(
        `SELECT * FROM mailbox_connections WHERE id = $1`,
        [id]
    );
    return result.rows[0];
}
export async function deleteMailbox(id: string) {
    // We use soft delete because campaigns and logs reference mailbox_id 
    // without CASCADE to preserve communication history.
    await db.query(`UPDATE mailbox_connections SET status = 'REVOKED', updated_at = NOW() WHERE id = $1`, [id]);
}
