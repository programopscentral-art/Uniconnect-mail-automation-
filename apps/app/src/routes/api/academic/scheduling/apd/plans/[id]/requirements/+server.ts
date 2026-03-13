import { APDPlanningService } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// POST — add a subject requirement to a plan
export const POST: RequestHandler = async ({ params, request, locals }) => {
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user?.role || '')) {
        throw error(403, 'Forbidden');
    }

    const body = await request.json();
    const { subject_code, subject_name, total_slots_required, slots_per_week,
            buffer_slots, lab_slots_required, lab_slots_per_week, priority, remarks, subject_id } = body;

    if (!subject_code || !total_slots_required) {
        throw error(400, 'subject_code and total_slots_required are required');
    }

    try {
        const req = await APDPlanningService.upsertSubjectRequirement(params.id, {
            subject_code, subject_name: subject_name || subject_code, subject_id,
            total_slots_required, slots_per_week: slots_per_week || 0,
            buffer_slots, lab_slots_required, lab_slots_per_week,
            priority, remarks
        });
        return json(req);
    } catch (e: any) {
        console.error('[POST /api/academic/scheduling/apd/plans/:id/requirements]', e.message);
        return json({ error: e.message }, { status: 500 });
    }
};
