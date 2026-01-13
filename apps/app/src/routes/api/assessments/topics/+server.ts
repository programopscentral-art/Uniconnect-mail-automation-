import { db, createAssessmentTopic, getAssessmentTopics, deleteAssessmentTopic } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const subjectId = url.searchParams.get('subjectId');
    if (!subjectId) throw error(400, 'Subject ID is required');

    try {
        const { rows: units } = await db.query(
            `SELECT * FROM assessment_units WHERE subject_id = $1 ORDER BY unit_number ASC`,
            [subjectId]
        );

        const unitsWithTopics = await Promise.all(units.map(async (u) => {
            const topics = await getAssessmentTopics(u.id);
            const { rows: counts } = await db.query(
                'SELECT marks, COUNT(*) as count FROM assessment_questions WHERE unit_id = $1 GROUP BY marks',
                [u.id]
            );
            return {
                ...u,
                topics,
                question_counts: counts.reduce((acc: any, curr: any) => {
                    acc[curr.marks] = parseInt(curr.count);
                    return acc;
                }, {})
            };
        }));

        return json(unitsWithTopics);
    } catch (err: any) {
        throw error(500, err.message);
    }
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const body = await request.json();
    if (!body.unit_id || !body.name) {
        throw error(400, 'Unit ID and Topic Name are required');
    }

    try {
        const topic = await createAssessmentTopic(body);
        return json(topic);
    } catch (err: any) {
        throw error(500, err.message);
    }
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const id = url.searchParams.get('id');
    if (!id) throw error(400, 'ID is required');

    try {
        await deleteAssessmentTopic(id);
        return json({ success: true });
    } catch (err: any) {
        throw error(500, err.message);
    }
};
