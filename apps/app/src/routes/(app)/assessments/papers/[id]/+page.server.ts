import { db } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals }) => {
    if (!locals.user) throw error(401);
    const paperId = params.id;

    try {
        const { rows } = await db.query(
            `SELECT p.*, s.name as subject_name, s.code as subject_code, b.name as branch_name, u.name as university_name,
                    t.name as template_name, t.layout_schema
             FROM assessment_papers p
             JOIN assessment_subjects s ON p.subject_id = s.id
             JOIN assessment_branches b ON p.branch_id = b.id
             JOIN universities u ON p.university_id = u.id
             LEFT JOIN assessment_templates t ON p.template_id = t.id
             WHERE p.id = $1`,
            [paperId]
        );

        const paper = rows[0];
        if (!paper) throw error(404, 'Question Paper not found');

        // Fetch Course Outcomes for the subject
        const { rows: courseOutcomes } = await db.query(
            'SELECT * FROM assessment_course_outcomes WHERE subject_id = $1 ORDER BY code ASC',
            [paper.subject_id]
        );

        // RBAC check
        if (locals.user.role === 'UNIVERSITY_OPERATOR' && locals.user.university_id !== paper.university_id) {
            throw error(403, 'Unauthorized Access');
        }

        // Fetch alternate questions pool for "Replace" feature
        const meta = paper.sets_data?.metadata || {};
        const unitIds = meta.unit_ids || [];

        let questionPool = [];
        if (unitIds.length > 0) {
            const { rows: pool } = await db.query(
                `SELECT q.id, q.question_text, q.marks, q.bloom_level, q.co_id, q.type, q.options, q.answer_key,
                        co.code as target_co
                 FROM assessment_questions q
                 LEFT JOIN assessment_course_outcomes co ON q.co_id = co.id
                 WHERE q.unit_id = ANY($1) 
                 ORDER BY q.marks ASC, q.created_at DESC`,
                [unitIds]
            );
            questionPool = pool;
        } else {
            // Fallback: Fetch all questions for the subject
            const { rows: pool } = await db.query(
                `SELECT q.id, q.question_text, q.marks, q.bloom_level, q.co_id, q.type, q.options, q.answer_key,
                        co.code as target_co
                 FROM assessment_questions q
                 JOIN assessment_units u ON q.unit_id = u.id
                 LEFT JOIN assessment_course_outcomes co ON q.co_id = co.id
                 WHERE u.subject_id = $1
                 ORDER BY q.marks ASC, q.created_at DESC`,
                [paper.subject_id]
            );
            questionPool = pool;
        }

        return { paper, courseOutcomes, questionPool };
    } catch (err: any) {
        console.error('[PAPER_LOAD] Error:', err);
        throw error(500, err.message);
    }
};
