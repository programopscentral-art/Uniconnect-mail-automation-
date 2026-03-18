import { ExamService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ params, request, locals }) => {
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user?.role || '')) throw error(403, 'Forbidden');
    const data = await request.json();
    try {
        const exam = await ExamService.addExamToPlan({ ...data, exam_plan_id: params.id });
        return json(exam, { status: 201 });
    } catch (e: any) {
        throw error(500, e.message);
    }
};
