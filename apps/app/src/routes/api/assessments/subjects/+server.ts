import { createAssessmentSubject, getAssessmentSubjects, updateAssessmentSubject, deleteAssessmentSubject } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const branchId = url.searchParams.get('branchId');
    const batchId = url.searchParams.get('batchId');
    const semester = url.searchParams.get('semester');

    if (!branchId) {
        throw error(400, 'Branch ID is required');
    }

    try {
        const subjects = await getAssessmentSubjects(
            branchId,
            semester ? parseInt(semester) : undefined,
            batchId || undefined
        );
        return json(subjects);
    } catch (err: any) {
        throw error(500, err.message);
    }
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const body = await request.json();
    if (!body.branch_id || !body.name) {
        throw error(400, 'Branch ID and Subject Name are required');
    }

    try {
        const subject = await createAssessmentSubject(body);
        return json(subject);
    } catch (err: any) {
        throw error(500, err.message);
    }
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const body = await request.json();
    if (!body.id) {
        throw error(400, 'ID is required');
    }

    try {
        const subject = await updateAssessmentSubject(body.id, body);
        return json(subject);
    } catch (err: any) {
        throw error(500, err.message);
    }
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const id = url.searchParams.get('id');
    if (!id) throw error(400, 'ID is required');

    try {
        await deleteAssessmentSubject(id);
        return json({ success: true });
    } catch (err: any) {
        throw error(500, err.message);
    }
};
