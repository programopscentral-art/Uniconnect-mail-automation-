import { createAssessmentBatch, updateAssessmentBatch, deleteAssessmentBatch } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const body = await request.json();
    if (!body.university_id || !body.name) {
        throw error(400, 'University ID and Batch Name are required');
    }

    if (locals.user.role === 'UNIVERSITY_OPERATOR' && locals.user.university_id !== body.university_id) {
        throw error(403, 'Unauthorized for this university');
    }

    try {
        const batch = await createAssessmentBatch(body);
        return json(batch);
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
        const batch = await updateAssessmentBatch(body.id, body);
        return json(batch);
    } catch (err: any) {
        throw error(500, err.message);
    }
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const id = url.searchParams.get('id');
    if (!id) throw error(400, 'ID is required');

    try {
        await deleteAssessmentBatch(id);
        return json({ success: true });
    } catch (err: any) {
        throw error(500, err.message);
    }
};
