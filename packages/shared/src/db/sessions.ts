import { db } from './client';
import crypto from 'crypto';

export interface SessionUser {
    id: string;
    email: string;
    role: string;
    university_id: string | null;
    name: string | null;
    display_name: string | null;
    phone: string | null;
    bio: string | null;
    age: number | null;
    profile_picture_url: string | null;
    presence_mode: 'AUTO' | 'MANUAL';
    universities: { id: string, name: string }[];
    permissions: string[];
}

const SESSION_TTL_HOURS = 168; // 7 days

export async function createSession(userId: string): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);

    await db.query(
        `INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
        [userId, tokenHash, expiresAt]
    );

    return token;
}

export async function validateSession(token: string): Promise<SessionUser | null> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const allFeatures = [
        'dashboard', 'tasks', 'universities', 'students', 'users',
        'analytics', 'mailboxes', 'templates', 'campaigns',
        'assessments', 'mail-logs', 'permissions'
    ];

    try {
        // Stage 1: Full query with all current features (v2.2+)
        const result = await db.query(
            `
        SELECT 
            u.id, u.email, u.role, u.university_id, u.name, u.is_active,
            u.display_name, u.phone, u.age, u.bio, u.profile_picture_url, u.presence_mode,
            COALESCE(
                (
                    SELECT json_agg(json_build_object('id', un.id, 'name', un.name, 'is_team', un.is_team) ORDER BY un.name)
                    FROM user_universities uu
                    JOIN universities un ON uu.university_id = un.id
                    WHERE uu.user_id = u.id
                ),
                '[]'::json
            ) as universities,
            rp.features as permissions
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        LEFT JOIN role_permissions rp ON u.role = rp.role
        WHERE s.token_hash = $1 AND s.expires_at > NOW()
        `,
            [tokenHash]
        );

        if (result.rows.length === 0) return null;
        const user = result.rows[0];

        // Ensure permissions is a valid array and provide defaults if missing/empty
        if (user.permissions === null || user.permissions === undefined) {
            if (user.role === 'ADMIN' || user.role === 'PROGRAM_OPS') {
                user.permissions = allFeatures;
            } else {
                user.permissions = ['dashboard', 'students'];
            }
        }

        return user;
    } catch (e: any) {
        console.error('[VALIDATE_SESSION_ERROR_FALLBACK_TRIGGERED]', e.message);
        // Stage 2: Absolute Core Fallback - Minimal columns, no joins
        try {
            const result = await db.query(
                `SELECT u.id, u.email, u.role, u.university_id, u.name, u.is_active,
                        u.display_name, u.phone, u.age, u.bio, u.profile_picture_url, u.presence_mode
                 FROM sessions s
                 JOIN users u ON s.user_id = u.id
                 WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
                [tokenHash]
            );

            if (result.rows.length === 0) return null;
            const user = result.rows[0];
            user.universities = [];
            user.permissions = (user.role === 'ADMIN' || user.role === 'PROGRAM_OPS') ? allFeatures : ['dashboard', 'students'];
            return user;
        } catch (fatal: any) {
            console.error('[VALIDATE_SESSION_FATAL]', fatal.message);
            return null;
        }
    }
}

export async function invalidateSession(token: string): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await db.query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash]);
}
