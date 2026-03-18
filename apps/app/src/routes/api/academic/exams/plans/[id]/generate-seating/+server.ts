import { ExamService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ params, request, locals }) => {
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user?.role || '')) throw error(403, 'Forbidden');
    const { classroomIds } = await request.json();
    if (!classroomIds?.length) throw error(400, 'classroomIds[] required');
    try {
        const result = await ExamService.generateSeatingPlan(params.id, classroomIds, locals.user.id);
        return json(result);
    } catch (e: any) {
        console.error('[POST generate-seating]', e.message);
        throw error(500, e.message);
    }
};
