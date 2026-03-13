import { APDPlanningService } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// GET — get a single APD plan with subject requirements
export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    try {
        const plan = await APDPlanningService.getPlanById(params.id);
        if (!plan) throw error(404, 'Plan not found');
        return json(plan);
    } catch (e: any) {
        if (e.status) throw e;
        console.error('[GET /api/academic/scheduling/apd/plans/:id]', e.message);
        return json({ error: e.message }, { status: 500 });
    }
};

// PATCH — update plan status
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user?.role || '')) {
        throw error(403, 'Forbidden');
    }

    const body = await request.json();
    const { status } = body;

    if (!status || !['DRAFT', 'ACTIVE', 'ARCHIVED'].includes(status)) {
        throw error(400, 'Valid status required: DRAFT, ACTIVE, or ARCHIVED');
    }

    try {
        await APDPlanningService.updatePlanStatus(params.id, status, locals.user.id);
        return json({ success: true });
    } catch (e: any) {
        console.error('[PATCH /api/academic/scheduling/apd/plans/:id]', e.message);
        return json({ error: e.message }, { status: 500 });
    }
};

// DELETE — delete a plan
export const DELETE: RequestHandler = async ({ params, locals }) => {
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user?.role || '')) {
        throw error(403, 'Forbidden');
    }

    try {
        await APDPlanningService.deletePlan(params.id);
        return json({ success: true });
    } catch (e: any) {
        console.error('[DELETE /api/academic/scheduling/apd/plans/:id]', e.message);
        return json({ error: e.message }, { status: 500 });
    }
};
