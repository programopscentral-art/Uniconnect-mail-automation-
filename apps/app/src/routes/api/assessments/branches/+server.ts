import { createAssessmentBranch, getAssessmentBranches, updateAssessmentBranch, deleteAssessmentBranch } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';


export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const universityId = url.searchParams.get('universityId');
    const batchId = url.searchParams.get('batchId');

    if (!universityId) {
        throw error(400, 'University ID is required');
    }

    try {
        const branches = await getAssessmentBranches(universityId, batchId || undefined);
        return json(branches);
    } catch (err: any) {
        throw error(500, err.message);
    }
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const body = await request.json();
    if (!body.university_id || !body.name) {
        throw error(400, 'University ID and Branch Name are required');
    }

    if (locals.user.role === 'UNIVERSITY_OPERATOR' && locals.user.university_id !== body.university_id) {
        throw error(403, 'Unauthorized for this university');
    }

    try {
        const branch = await createAssessmentBranch(body);
        return json(branch);
    } catch (err: any) {
        throw error(500, err.message);
    }
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const body = await request.json();
    if (!body.id || !body.name) {
        throw error(400, 'ID and Name are required');
    }

    try {
        const branch = await updateAssessmentBranch(body.id, body);
        return json(branch);
    } catch (err: any) {
        throw error(500, err.message);
    }
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const id = url.searchParams.get('id');
    if (!id) throw error(400, 'ID is required');

    try {
        await deleteAssessmentBranch(id);
        return json({ success: true });
    } catch (err: any) {
        throw error(500, err.message);
    }
};
