import { TimetableOpsService } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user?.role || '')) {
        throw error(403, 'Forbidden');
    }

    const body = await request.json();
    const { universityId, sourceWeekStart, sourceWeekEnd, targetWeekStart, targetWeekEnd } = body;

    if (!universityId || !sourceWeekStart || !sourceWeekEnd || !targetWeekStart || !targetWeekEnd) {
        throw error(400, 'Missing required fields');
    }

    try {
        const result = await TimetableOpsService.cloneWeek(
            universityId, sourceWeekStart, sourceWeekEnd, targetWeekStart, targetWeekEnd,
            locals.user?.id
        );
        return json(result);
    } catch (e: any) {
        return json({ success: false, message: e.message }, { status: 500 });
    }
};
