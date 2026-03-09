import { db } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }: { url: URL, locals: App.Locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const universityId = url.searchParams.get('universityId');
    if (!universityId) throw error(400, 'universityId is required');

    const result = await db.query(
        `SELECT fp.*, u.full_name as name, u.email
         FROM faculty_profiles fp
         JOIN users u ON fp.user_id = u.id
         WHERE fp.university_id = $1 AND fp.is_active = true
         ORDER BY u.full_name ASC`,
        [universityId]
    );

    return json(result.rows);
};

export const POST: RequestHandler = async ({ request, locals }: { request: Request, locals: App.Locals }) => {
    if (locals.user?.role !== 'ADMIN' && locals.user?.role !== 'PROGRAM_OPS') {
        throw error(403, 'Forbidden');
    }

    const { university_id, ...data } = await request.json();

    if (!university_id) {
        throw error(400, 'university_id is required');
    }

    // Logic for single creation if needed, though we primarily use bulk import
    const res = await db.query(
        `INSERT INTO faculty_profiles (user_id, university_id, employee_code, department, specialization, designation, joining_date, employment_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [data.user_id, university_id, data.employee_code, data.department, data.specialization, data.designation, data.joining_date, 'ACTIVE']
    );

    return json(res.rows[0]);
};
