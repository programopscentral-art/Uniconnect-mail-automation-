import { createAssessmentUnit, deleteAssessmentUnit } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const body = await request.json();
    if (!body.subject_id || !body.unit_number) {
        throw error(400, 'Subject ID and Unit Number are required');
    }

    try {
        const unit = await createAssessmentUnit(body);
        return json(unit);
    } catch (err: any) {
        throw error(500, err.message);
    }
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const id = url.searchParams.get('id');
    if (!id) throw error(400, 'ID is required');

    try {
        await deleteAssessmentUnit(id);
        return json({ success: true });
    } catch (err: any) {
        throw error(500, err.message);
    }
};
