import { APDPlanningService } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// GET — list APD plans for a university
export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const universityId = url.searchParams.get('universityId') || locals.user.university_id;
    if (!universityId) throw error(400, 'universityId required');

    const termId = url.searchParams.get('termId') || undefined;

    try {
        const plans = await APDPlanningService.getPlans(universityId, termId);
        return json(plans);
    } catch (e: any) {
        console.error('[GET /api/academic/scheduling/apd/plans]', e.message);
        return json([]);
    }
};

// POST — manually create an APD plan (without file import)
export const POST: RequestHandler = async ({ request, locals }) => {
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user?.role || '')) {
        throw error(403, 'Forbidden');
    }

    const body = await request.json();
    const { universityId, termId, programId, ...planData } = body;

    if (!universityId) throw error(400, 'universityId is required');

    try {
        const plan = await APDPlanningService.savePlan(universityId, planData, {
            termId, programId, createdBy: locals.user.id
        });
        return json(plan);
    } catch (e: any) {
        console.error('[POST /api/academic/scheduling/apd/plans]', e);
        return json({ error: e.message }, { status: 500 });
    }
};
