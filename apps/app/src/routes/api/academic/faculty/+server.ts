import { db } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }: { url: URL, locals: App.Locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const universityId = url.searchParams.get('universityId');
    if (!universityId) throw error(400, 'universityId is required');

    try {
        const result = await db.query(
            `SELECT fp.id, fp.employee_code, fp.department, fp.specialization, fp.designation,
                    fp.joining_date, fp.employment_status, fp.is_active, fp.created_at, fp.university_id,
                    COALESCE(u.name, fp.employee_code) as name,
                    COALESCE(u.email, '') as email,
                    COALESCE(u.phone, '') as phone
             FROM faculty_profiles fp
             LEFT JOIN users u ON fp.user_id = u.id
             WHERE fp.university_id = $1 AND fp.is_active = true
             ORDER BY name ASC`,
            [universityId]
        );
        return json(result.rows);
    } catch (e: any) {
        console.error('[GET /api/academic/faculty]', e.message);
        return json([]);
    }
};

export const POST: RequestHandler = async ({ request, locals }: { request: Request, locals: App.Locals }) => {
    if (locals.user?.role !== 'ADMIN' && locals.user?.role !== 'PROGRAM_OPS') {
        throw error(403, 'Forbidden');
    }

    const { university_id, name, email, phone, employee_code, department, specialization, designation } = await request.json();

    if (!university_id) throw error(400, 'university_id is required');
    if (!employee_code) throw error(400, 'employee_code is required');

    // Create or find user if email provided
    let userId: string | null = null;
    if (email) {
        const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.trim().toLowerCase()]);
        if (existing.rows.length > 0) {
            userId = existing.rows[0].id;
            // Update name/phone on existing user
            if (name || phone) {
                const sets: string[] = [];
                const params: any[] = [userId];
                let idx = 2;
                if (name)  { sets.push(`name = $${idx++}`);  params.push(name); }
                if (phone) { sets.push(`phone = $${idx++}`);  params.push(phone); }
                await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1`, params);
            }
        } else {
            const userRes = await db.query(
                `INSERT INTO users (email, name, role, university_id, phone) VALUES ($1, $2, 'FACULTY', $3, $4) RETURNING id`,
                [email.trim().toLowerCase(), name || employee_code, university_id, phone || null]
            );
            userId = userRes.rows[0].id;
        }
    }

    const res = await db.query(
        `INSERT INTO faculty_profiles (user_id, university_id, employee_code, department, specialization, designation, joining_date, employment_status, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'ACTIVE', true)
         RETURNING *`,
        [userId, university_id, employee_code.trim(), department || 'General', specialization || null, designation || 'Assistant Professor']
    );

    return json(res.rows[0]);
};

// PATCH — update a faculty profile
export const PATCH: RequestHandler = async ({ request, locals }: { request: Request, locals: App.Locals }) => {
    if (locals.user?.role !== 'ADMIN' && locals.user?.role !== 'PROGRAM_OPS') {
        throw error(403, 'Forbidden');
    }

    const { id, name, email, phone, department, specialization, designation, employee_code } = await request.json();
    if (!id) throw error(400, 'id is required');

    // Update faculty profile fields
    await db.query(
        `UPDATE faculty_profiles SET
            department = COALESCE($2, department),
            specialization = COALESCE($3, specialization),
            designation = COALESCE($4, designation),
            employee_code = COALESCE($5, employee_code),
            updated_at = NOW()
         WHERE id = $1`,
        [id, department, specialization, designation, employee_code]
    );

    // If name/email/phone provided, update the linked user record
    if (name || email || phone) {
        const fp = await db.query('SELECT user_id FROM faculty_profiles WHERE id = $1', [id]);
        const userId = fp.rows[0]?.user_id;
        if (userId) {
            const sets: string[] = [];
            const params: any[] = [userId];
            let idx = 2;
            if (name)  { sets.push(`name = $${idx++}`);  params.push(name); }
            if (email) { sets.push(`email = $${idx++}`);  params.push(email); }
            if (phone) { sets.push(`phone = $${idx++}`);  params.push(phone); }
            if (sets.length > 0) {
                await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1`, params);
            }
        }
    }

    return json({ success: true });
};

// DELETE — deactivate a faculty profile
export const DELETE: RequestHandler = async ({ url, locals }: { url: URL, locals: App.Locals }) => {
    if (locals.user?.role !== 'ADMIN' && locals.user?.role !== 'PROGRAM_OPS') {
        throw error(403, 'Forbidden');
    }

    const id = url.searchParams.get('id');
    if (!id) throw error(400, 'id is required');

    await db.query('UPDATE faculty_profiles SET is_active = false, updated_at = NOW() WHERE id = $1', [id]);
    return json({ success: true });
};
