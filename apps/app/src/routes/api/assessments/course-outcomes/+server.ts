import { json, error } from '@sveltejs/kit';
import {
    getCourseOutcomes,
    createCourseOutcome,
    updateCourseOutcome,
    deleteCourseOutcome
} from '@uniconnect/shared';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);
    const subjectId = url.searchParams.get('subjectId');
    if (!subjectId) throw error(400, 'Subject ID is required');

    const cos = await getCourseOutcomes(subjectId);
    return json(cos);
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);
    const body = await request.json();
    const co = await createCourseOutcome(body);
    return json(co);
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);
    const body = await request.json();
    if (!body.id) throw error(400, 'ID is required');
    const co = await updateCourseOutcome(body.id, body);
    return json(co);
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
    if (!locals.user || locals.user.role !== 'UNIVERSITY_OPERATOR' && locals.user.role !== 'ADMIN') throw error(401);
    const id = url.searchParams.get('id');
    if (!id) throw error(400, 'ID is required');
    await deleteCourseOutcome(id);
    return json({ success: true });
};
