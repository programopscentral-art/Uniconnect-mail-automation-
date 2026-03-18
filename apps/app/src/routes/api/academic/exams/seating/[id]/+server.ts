import { ExamService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params, url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');
    const classroomId = url.searchParams.get('classroomId') || undefined;
    try {
        const plan = await ExamService.getSeatingPlan(params.id, classroomId);
        return json(plan);
    } catch (e: any) {
        return json(classroomId ? null : []);
    }
};
