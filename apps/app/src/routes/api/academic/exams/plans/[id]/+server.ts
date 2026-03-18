import { ExamService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');
    try {
        const plan = await ExamService.getExamPlan(params.id);
        if (!plan) throw error(404, 'Plan not found');
        const exams = await ExamService.getExamSchedule(params.id);
        const stats = await ExamService.getExamPlanStats(params.id);
        return json({ ...plan, exams, stats });
    } catch (e: any) {
        if (e.status) throw e;
        throw error(500, e.message);
    }
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user?.role || '')) throw error(403, 'Forbidden');
    try {
        await ExamService.deleteExamPlan(params.id);
        return json({ success: true });
    } catch (e: any) {
        throw error(500, e.message);
    }
};
