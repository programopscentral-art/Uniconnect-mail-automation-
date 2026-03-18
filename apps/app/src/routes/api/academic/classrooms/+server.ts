import { ClassroomService } from '@uniconnect/shared';
import { db } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');
    const universityId = url.searchParams.get('universityId');
    if (!universityId) throw error(400, 'universityId required');

    try {
        const classrooms = await ClassroomService.getClassrooms(universityId);
        return json(classrooms);
    } catch (e: any) {
        console.error('[GET /api/academic/classrooms]', e.message);
        return json([]);
    }
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user?.role || '')) {
        throw error(403, 'Forbidden');
    }
    const data = await request.json();
    try {
        const classroom = await ClassroomService.createClassroom(data);
        return json(classroom, { status: 201 });
    } catch (e: any) {
        console.error('[POST /api/academic/classrooms]', e.message);
        throw error(500, e.message);
    }
};

// DELETE all classrooms for a university
export const DELETE: RequestHandler = async ({ url, locals }) => {
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user?.role || '')) {
        throw error(403, 'Forbidden');
    }
    const universityId = url.searchParams.get('universityId');
    if (universityId) {
        const result = await db.query(
            `DELETE FROM classrooms WHERE university_id = $1 RETURNING id`,
            [universityId]
        );
        return json({ deleted: result.rowCount });
    }
    // Delete ALL classrooms
    const result = await db.query(`DELETE FROM classrooms RETURNING id`);
    return json({ deleted: result.rowCount });
};
