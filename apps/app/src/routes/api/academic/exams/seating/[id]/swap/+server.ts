import { ExamService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ params, request, locals }) => {
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user?.role || '')) throw error(403, 'Forbidden');
    const { seat1, seat2 } = await request.json();
    try {
        const result = await ExamService.swapStudents(params.id, seat1, seat2);
        return json(result);
    } catch (e: any) {
        throw error(500, e.message);
    }
};
