import { ExamService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ params, request, locals }) => {
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user?.role || '')) throw error(403, 'Forbidden');
    const { timeSlots, classroomIds, excludeDates } = await request.json();
    if (!timeSlots?.length) throw error(400, 'timeSlots[] required');
    if (!classroomIds?.length) throw error(400, 'classroomIds[] required');
    try {
        const result = await ExamService.autoGenerateTimetable({
            examPlanId: params.id,
            timeSlots,
            classroomIds,
            excludeDates: excludeDates || []
        });
        return json(result);
    } catch (e: any) {
        console.error('[POST generate-timetable]', e.message);
        throw error(500, e.message);
    }
};
