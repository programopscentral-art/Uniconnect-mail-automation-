import { db } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ url, locals }) => {
    if (!locals.user) throw error(401);
    const topicId = url.searchParams.get('topicId');

    if (!topicId) throw error(400, 'Topic ID is required');

    try {
        const { rows: topicRows } = await db.query(
            `SELECT t.*, u.unit_number, s.name as subject_name, s.id as subject_id, s.difficulty_levels
             FROM assessment_topics t
             JOIN assessment_units u ON t.unit_id = u.id
             JOIN assessment_subjects s ON u.subject_id = s.id
             WHERE t.id = $1`,
            [topicId]
        );
        const topic = topicRows[0];
        if (!topic) throw error(404, 'Topic not found');

        const { rows: questions } = await db.query(
            'SELECT * FROM assessment_questions WHERE topic_id = $1 ORDER BY created_at DESC',
            [topicId]
        );

        // Fetch Course Outcomes for the subject
        const { rows: courseOutcomes } = await db.query(
            'SELECT * FROM assessment_course_outcomes WHERE subject_id = $1 ORDER BY code ASC',
            [topic.subject_id]
        );

        return {
            topic,
            questions,
            courseOutcomes
        };
    } catch (err: any) {
        console.error('[QUESTIONS_LOAD] Error:', err);
        throw error(500, err.message);
    }
};
