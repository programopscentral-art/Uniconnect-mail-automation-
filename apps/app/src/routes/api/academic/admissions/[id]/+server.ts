import { json, error } from '@sveltejs/kit';
import { AdmissionService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);

    const workflow = await AdmissionService.getWorkflow(params.id);
    if (!workflow) throw error(404, 'Workflow not found');

    return json(workflow);
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);

    const allowedRoles = ['ADMIN', 'PROGRAM_OPS', 'UNIVERSITY_OPERATOR'];
    if (!allowedRoles.includes(locals.user.role as string)) {
        throw error(403, 'Insufficient permissions');
    }

    const data = await request.json();

    if (data.status) {
        await AdmissionService.updateStatus(params.id, data.status, locals.user.id, data.remarks);
    }
    if (data.step) {
        await AdmissionService.advanceStep(params.id, data.step, locals.user.id);
    }
    if (data.reviewer_id) {
        await AdmissionService.assignReviewer(params.id, data.reviewer_id);
    }

    return json({ success: true });
};
