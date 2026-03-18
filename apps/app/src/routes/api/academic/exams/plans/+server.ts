import { ExamService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');
    const universityId = url.searchParams.get('universityId');
    if (!universityId) throw error(400, 'universityId required');
    try {
        const plans = await ExamService.getExamPlans(universityId);
        return json(plans);
    } catch (e: any) {
        console.error('[GET /api/academic/exams/plans]', e.message);
        return json([]);
    }
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user?.role || '')) throw error(403, 'Forbidden');
    const data = await request.json();
    try {
        const plan = await ExamService.createExamPlan(data);
        return json(plan, { status: 201 });
    } catch (e: any) {
        throw error(500, e.message);
    }
};
