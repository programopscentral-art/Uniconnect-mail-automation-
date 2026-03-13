import { APDPlanningService } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// DELETE — remove a subject requirement
export const DELETE: RequestHandler = async ({ params, locals }) => {
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user?.role || '')) {
        throw error(403, 'Forbidden');
    }

    try {
        await APDPlanningService.deleteSubjectRequirement(params.reqId);
        return json({ success: true });
    } catch (e: any) {
        console.error('[DELETE /api/.../requirements/:reqId]', e.message);
        return json({ error: e.message }, { status: 500 });
    }
};
