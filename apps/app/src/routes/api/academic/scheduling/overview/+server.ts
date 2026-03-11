import { SchedulingService } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// GET — overview metrics for scheduling dashboard
export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const universityId = url.searchParams.get('universityId') || locals.user.university_id;
    if (!universityId) throw error(400, 'universityId required');

    try {
        const metrics = await SchedulingService.getOverviewMetrics(universityId);
        return json(metrics);
    } catch (e: any) {
        console.error('[GET /api/academic/scheduling/overview]', e.message);
        return json({ totalSessions: 0, completedSessions: 0, openConflicts: 0, todaySessions: [] });
    }
};
