import { db } from './client';

export type UserRole = 'ADMIN' | 'PROGRAM_OPS' | 'UNIVERSITY_OPERATOR' | 'COS' | 'PM' | 'PMA' | 'BOA';

export interface User {
    id: string;
    email: string;
    name: string | null;
    display_name: string | null;
    phone: string | null;
    bio: string | null;
    age: number | null;
    profile_picture_url: string | null;
    role: string;
    university_id: string | null;
    is_active: boolean;
    last_login_at: Date | null;
    created_at: Date;
}

export async function getUserByEmail(email: string) {
    const result = await db.query(`SELECT * FROM users WHERE email = $1`, [email]);
    return result.rows[0] as User | null;
}

export async function getUserById(id: string) {
    const result = await db.query(`SELECT * FROM users WHERE id = $1`, [id]);
    return result.rows[0] as User | null;
}

export async function getAllUsers(universityId?: string) {
    let query = `
    SELECT u.*, 
           u_univ.name as university_name,
           COALESCE(
               json_agg(
                   json_build_object('id', uu_univ.id, 'name', uu_univ.name)
               ) FILTER (WHERE uu_univ.id IS NOT NULL),
               '[]'::json
           ) as universities
    FROM users u 
    LEFT JOIN universities u_univ ON u.university_id = u_univ.id
    LEFT JOIN user_universities uu ON u.id = uu.user_id
    LEFT JOIN universities uu_univ ON uu.university_id = uu_univ.id
    WHERE u.is_active = true
  `;
    const params: any[] = [];
    if (universityId) {
        query += ` AND (u.university_id = $1 OR uu.university_id = $1) `;
        params.push(universityId);
    }
    query += ` GROUP BY u.id, u_univ.name ORDER BY u.created_at DESC `;

    const result = await db.query(query, params);
    return result.rows as (User & { university_name: string | null; universities: Array<{ id: string; name: string }> })[];
}

export async function createUser(data: {
    email: string;
    name: string;
    role: UserRole;
    university_id?: string | null;
    university_ids?: string[];  // New: array of university IDs
}) {
    // Create the user with primary university_id (for backward compatibility)
    const primaryUniversityId = data.university_ids?.[0] || data.university_id || null;

    const result = await db.query(
        `INSERT INTO users (email, name, role, university_id) VALUES ($1, $2, $3, $4) RETURNING *`,
        [data.email, data.name, data.role, primaryUniversityId]
    );

    const user = result.rows[0] as User;

    // If university_ids array is provided, insert into junction table
    if (data.university_ids && data.university_ids.length > 0) {
        const values = data.university_ids.map((univId, idx) =>
            `($1, $${idx + 2})`
        ).join(', ');

        await db.query(
            `INSERT INTO user_universities (user_id, university_id) 
             VALUES ${values} 
             ON CONFLICT (user_id, university_id) DO NOTHING`,
            [user.id, ...data.university_ids]
        );
    }

    return user;
}

export async function updateUser(id: string, data: {
    name?: string;
    display_name?: string | null;
    phone?: string | null;
    bio?: string | null;
    age?: number | null;
    profile_picture_url?: string | null;
    role?: UserRole;
    university_id?: string | null;
    university_ids?: string[];  // New: array of university IDs
    is_active?: boolean
}) {
    // Extract university_ids before updating the user table
    const { university_ids, ...userData } = data;

    // Update primary university_id if university_ids is provided
    if (university_ids && university_ids.length > 0) {
        userData.university_id = university_ids[0];
    }

    // Update user table fields
    if (Object.keys(userData).length > 0) {
        const fields: string[] = [];
        const values: any[] = [];
        let i = 1;

        Object.entries(userData).forEach(([key, val]) => {
            fields.push(`${key} = $${i++}`);
            values.push(val);
        });

        values.push(id);
        await db.query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${i}`, values);
    }

    // Update junction table if university_ids is provided
    if (university_ids !== undefined) {
        // Delete existing associations
        await db.query(`DELETE FROM user_universities WHERE user_id = $1`, [id]);

        // Insert new associations
        if (university_ids.length > 0) {
            const values = university_ids.map((univId, idx) =>
                `($1, $${idx + 2})`
            ).join(', ');

            await db.query(
                `INSERT INTO user_universities (user_id, university_id) 
                 VALUES ${values} 
                 ON CONFLICT (user_id, university_id) DO NOTHING`,
                [id, ...university_ids]
            );
        }
    }
}

export async function deleteUser(id: string) {
    // Soft delete to preserve referential integrity (templates, campaigns)
    await db.query(`UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1`, [id]);
}


export async function updateLastLogin(userId: string) {
    await db.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [userId]);
}

export async function getUserStats(userId: string) {
    const tasks = await db.query(
        `SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed
         FROM tasks 
         WHERE assigned_to = $1`,
        [userId]
    );

    const mails = await db.query(
        `SELECT COUNT(*) as total
         FROM campaign_recipients r
         JOIN campaigns c ON r.campaign_id = c.id
         WHERE c.created_by_user_id = $1 AND r.status != 'PENDING'`,
        [userId]
    );

    const taskCount = parseInt(tasks.rows[0].total || '0');
    const taskCompleted = parseInt(tasks.rows[0].completed || '0');
    const mailCount = parseInt(mails.rows[0].total || '0');

    const efficiency = taskCount > 0 ? Math.round((taskCompleted / taskCount) * 100) : 100;

    let impactRating = 'Bronze Operator';
    if (taskCompleted > 50 || mailCount > 1000) impactRating = 'Silver Operator';
    if (taskCompleted > 200 || mailCount > 5000) impactRating = 'Gold Partner';
    if (taskCompleted > 1000) impactRating = 'Platinum Lead';

    return {
        tasks: { total: taskCount, completed: taskCompleted },
        mails: { total: mailCount },
        efficiency,
        impactRating
    };
}

export async function getUserAuditLogs(userId: string, limit = 5) {
    const result = await db.query(
        `SELECT * FROM audit_logs 
         WHERE user_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2`,
        [userId, limit]
    );
    return result.rows;
}

export async function getAdmins(universityId?: string | null) {
    let query = `SELECT * FROM users WHERE role IN ('ADMIN', 'PROGRAM_OPS')`;
    const params: any[] = [];

    if (universityId) {
        query += ` OR (role = 'UNIVERSITY_OPERATOR' AND university_id = $1)`;
        params.push(universityId);
    }

    const result = await db.query(query, params);
    return result.rows as User[];
}

