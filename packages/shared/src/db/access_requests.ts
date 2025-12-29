import { db } from './client';

export interface AccessRequest {
    id: string;
    user_id: string;
    university_ids: string[];
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    admin_notes: string | null;
    created_at: Date;
    updated_at: Date;
}

export async function createAccessRequest(userId: string, universityIds: string[]) {
    const result = await db.query(
        `INSERT INTO access_requests (user_id, university_ids) VALUES ($1, $2) RETURNING *`,
        [userId, universityIds]
    );
    return result.rows[0] as AccessRequest;
}

export async function getAccessRequestsByUser(userId: string) {
    const result = await db.query(
        `SELECT * FROM access_requests WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId]
    );
    return result.rows as AccessRequest[];
}

export async function getAllAccessRequests() {
    const result = await db.query(`
        SELECT ar.*, u.email as user_email, u.name as user_name
        FROM access_requests ar
        JOIN users u ON ar.user_id = u.id
        ORDER BY ar.created_at DESC
    `);
    return result.rows;
}

export async function updateAccessRequestStatus(id: string, status: 'APPROVED' | 'REJECTED', adminNotes?: string) {
    const result = await db.query(
        `UPDATE access_requests SET status = $1, admin_notes = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
        [status, adminNotes || null, id]
    );
    return result.rows[0] as AccessRequest;
}

export async function getPendingAccessByUserId(userId: string) {
    const result = await db.query(
        `SELECT * FROM access_requests WHERE user_id = $1 AND status = 'PENDING'`,
        [userId]
    );
    return result.rows as AccessRequest[];
}
