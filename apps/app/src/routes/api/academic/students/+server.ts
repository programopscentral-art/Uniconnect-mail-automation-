import { db } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// GET /api/academic/students?sectionId=X
export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const sectionId = url.searchParams.get('sectionId');
    if (!sectionId) throw error(400, 'sectionId is required');

    try {
        const result = await db.query(
            `SELECT sp.id, sp.roll_number, sp.current_semester,
                    COALESCE(u.name, sp.roll_number) as name,
                    COALESCE(u.email, '') as email
             FROM student_profiles sp
             LEFT JOIN users u ON sp.user_id = u.id
             WHERE sp.section_id = $1
             ORDER BY sp.roll_number ASC`,
            [sectionId]
        );
        return json(result.rows);
    } catch (e: any) {
        console.error('[GET /api/academic/students]', e.message);
        return json([]);
    }
};
