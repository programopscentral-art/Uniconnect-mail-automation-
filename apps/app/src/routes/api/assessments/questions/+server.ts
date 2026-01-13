import { getAssessmentQuestions, createAssessmentQuestion, updateAssessmentQuestion, deleteAssessmentQuestion } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const topicId = url.searchParams.get('topicId');
    const unitId = url.searchParams.get('unitId');

    try {
        const questions = await getAssessmentQuestions(topicId || undefined, unitId || undefined);
        return json(questions);
    } catch (err: any) {
        throw error(500, err.message);
    }
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const body = await request.json();
    if ((!body.topic_id && !body.unit_id) || !body.question_text) {
        throw error(400, 'Topic ID or Unit ID and Question Text are required');
    }

    try {
        const question = await createAssessmentQuestion(body);
        return json(question);
    } catch (err: any) {
        throw error(500, err.message);
    }
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const body = await request.json();
    if (!body.id) throw error(400, 'Question ID is required');

    try {
        const question = await updateAssessmentQuestion(body.id, body);
        return json(question);
    } catch (err: any) {
        throw error(500, err.message);
    }
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const id = url.searchParams.get('id');
    if (!id) throw error(400, 'Question ID is required');

    try {
        await deleteAssessmentQuestion(id);
        return json({ success: true });
    } catch (err: any) {
        throw error(500, err.message);
    }
};
