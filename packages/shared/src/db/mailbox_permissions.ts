import { db } from './client';

export interface MailboxPermission {
    id: string;
    mailbox_id: string;
    user_id: string;
    status: 'PENDING' | 'APPROVED' | 'REVOKED';
    created_at: Date;
    user_name?: string;
    user_email?: string;
    mailbox_email?: string;
}

export async function requestMailboxAccess(mailboxId: string, userId: string) {
    const result = await db.query(
        `INSERT INTO mailbox_access_permissions (mailbox_id, user_id, status)
         VALUES ($1, $2, 'PENDING')
         ON CONFLICT (mailbox_id, user_id) DO UPDATE SET status = 'PENDING', updated_at = NOW()
         RETURNING *`,
        [mailboxId, userId]
    );
    return result.rows[0] as MailboxPermission;
}

export async function updateMailboxAccessStatus(permissionId: string, status: 'APPROVED' | 'REVOKED') {
    const result = await db.query(
        `UPDATE mailbox_access_permissions SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [status, permissionId]
    );
    return result.rows[0] as MailboxPermission;
}

export async function getMailboxPermissions(universityId: string) {
    const result = await db.query(
        `SELECT p.*, u.name as user_name, u.email as user_email, m.email as mailbox_email
         FROM mailbox_access_permissions p
         JOIN users u ON p.user_id = u.id
         JOIN mailbox_connections m ON p.mailbox_id = m.id
         WHERE m.university_id = $1
         ORDER BY p.created_at DESC`,
        [universityId]
    );
    return result.rows as MailboxPermission[];
}

export async function getUserMailboxPermissions(userId: string) {
    const result = await db.query(
        `SELECT p.*, m.email as mailbox_email, m.university_id
         FROM mailbox_access_permissions p
         JOIN mailbox_connections m ON p.mailbox_id = m.id
         WHERE p.user_id = $1 AND p.status = 'APPROVED'`,
        [userId]
    );
    return result.rows as MailboxPermission[];
}

export async function hasMailboxAccess(userId: string, mailboxId: string): Promise<boolean> {
    const result = await db.query(
        `SELECT 1 FROM mailbox_access_permissions 
         WHERE user_id = $1 AND mailbox_id = $2 AND status = 'APPROVED'`,
        [userId, mailboxId]
    );
    return result.rowCount ? result.rowCount > 0 : false;
}
