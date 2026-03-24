import { json, error } from '@sveltejs/kit';
import { AdmissionService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const universityId = url.searchParams.get('university_id') || locals.user.university_id;
    if (!universityId) throw error(400, 'University ID required');

    const filters = {
        status: url.searchParams.get('status') || undefined,
        step: url.searchParams.get('step') || undefined,
        search: url.searchParams.get('search') || undefined,
        programId: url.searchParams.get('program_id') || undefined,
        limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : 50,
        offset: url.searchParams.get('offset') ? parseInt(url.searchParams.get('offset')!) : 0,
    };

    const workflows = await AdmissionService.getWorkflowsByUniversity(universityId, filters);
    return json(workflows);
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const allowedRoles = ['ADMIN', 'PROGRAM_OPS', 'UNIVERSITY_OPERATOR'];
    if (!allowedRoles.includes(locals.user.role as string)) {
        throw error(403, 'Insufficient permissions');
    }

    const { student_profile_id, university_id } = await request.json();
    if (!student_profile_id || !university_id) {
        throw error(400, 'student_profile_id and university_id are required');
    }

    const workflow = await AdmissionService.createWorkflow(student_profile_id, university_id);
    return json(workflow);
};
