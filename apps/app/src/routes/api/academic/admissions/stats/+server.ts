import { json, error } from '@sveltejs/kit';
import { AdmissionService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const universityId = url.searchParams.get('university_id') || locals.user.university_id;
    if (!universityId) throw error(400, 'University ID required');

    const stats = await AdmissionService.getWorkflowStats(universityId);
    return json(stats);
};
