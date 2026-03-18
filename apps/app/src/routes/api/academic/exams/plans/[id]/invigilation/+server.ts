import { ExamService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');
    try {
        const assignments = await ExamService.getInvigilationAssignments(params.id);
        return json(assignments);
    } catch (e: any) {
        return json([]);
    }
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user?.role || '')) throw error(403, 'Forbidden');
    const { universityId } = await request.json();
    try {
        const result = await ExamService.autoAssignInvigilators(params.id, universityId, locals.user.id);
        return json(result);
    } catch (e: any) {
        throw error(500, e.message);
    }
};
