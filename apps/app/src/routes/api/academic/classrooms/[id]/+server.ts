import { ClassroomService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');
    try {
        const classroom = await ClassroomService.getClassroom(params.id);
        if (!classroom) throw error(404, 'Classroom not found');
        return json(classroom);
    } catch (e: any) {
        if (e.status) throw e;
        throw error(500, e.message);
    }
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user?.role || '')) {
        throw error(403, 'Forbidden');
    }
    const data = await request.json();
    try {
        const updated = await ClassroomService.updateClassroom(params.id, data);
        return json(updated);
    } catch (e: any) {
        throw error(500, e.message);
    }
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user?.role || '')) {
        throw error(403, 'Forbidden');
    }
    try {
        await ClassroomService.deleteClassroom(params.id);
        return json({ success: true });
    } catch (e: any) {
        throw error(500, e.message);
    }
};
