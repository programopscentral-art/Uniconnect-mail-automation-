import { db } from './client';
import { UserRole } from './users';
import { v4 as uuidv4 } from 'uuid';

export interface Invitation {
    id: string;
    email: string;
    role: UserRole;
    university_id: string | null;
    token: string;
    expires_at: Date;
    created_at: Date;
    invited_by: string | null;
}

export async function createInvitation(data: {
    email: string;
    role: UserRole;
    university_id?: string | null;
    invited_by: string;
}) {
    const token = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

    const result = await db.query(
        `INSERT INTO invitations (email, role, university_id, token, expires_at, invited_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (email) DO UPDATE SET
            role = EXCLUDED.role,
            university_id = EXCLUDED.university_id,
            token = EXCLUDED.token,
            expires_at = EXCLUDED.expires_at,
            invited_by = EXCLUDED.invited_by,
            created_at = NOW()
         RETURNING *`,
        [data.email.toLowerCase(), data.role, data.university_id || null, token, expiresAt, data.invited_by]
    );

    return result.rows[0] as Invitation;
}

export async function getInvitationByToken(token: string) {
    const result = await db.query(
        `SELECT * FROM invitations WHERE token = $1 AND expires_at > NOW()`,
        [token]
    );
    return result.rows[0] as Invitation | null;
}

export async function deleteInvitation(id: string) {
    await db.query(`DELETE FROM invitations WHERE id = $1`, [id]);
}

export async function getInvitationByEmail(email: string) {
    const result = await db.query(
        `SELECT * FROM invitations WHERE email = $1 AND expires_at > NOW()`,
        [email.toLowerCase()]
    );
    return result.rows[0] as Invitation | null;
}
