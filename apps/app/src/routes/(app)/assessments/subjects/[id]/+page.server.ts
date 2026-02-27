import { db, getAssessmentUnits, getAssessmentTopics } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals }) => {
    if (!locals.user) throw error(401);
    const subjectId = params.id;

    try {
        // Fetch Subject details
        const { rows: subjectRows } = await db.query(
            `SELECT s.*, b.name as branch_name, b.university_id, b.batch_id 
             FROM assessment_subjects s
             JOIN assessment_branches b ON s.branch_id = b.id
             WHERE s.id = $1`,
            [subjectId]
        );
        const subject = subjectRows[0];
        if (!subject) throw error(404, 'Subject not found');

        // RBAC check
        if (locals.user.role === 'UNIVERSITY_OPERATOR' && locals.user.university_id !== subject.university_id) {
            throw error(403, 'Unauthorized Access');
        }

        // Use Promise.all for parallel execution of all secondary queries
        const [
            units,
            { rows: allTopics },
            { rows: courseOutcomes },
            { rows: practicals },
            { rows: allQuestions },
            { rows: papers }
        ] = await Promise.all([
            getAssessmentUnits(subjectId),
            db.query(
                `SELECT t.* FROM assessment_topics t
                 JOIN assessment_units u ON t.unit_id = u.id
                 WHERE u.subject_id = $1
                 ORDER BY t.name ASC`,
                [subjectId]
            ),
            db.query(
                'SELECT * FROM assessment_course_outcomes WHERE subject_id = $1 ORDER BY code ASC',
                [subjectId]
            ),
            db.query(
                'SELECT * FROM assessment_practicals WHERE subject_id = $1 ORDER BY created_at ASC',
                [subjectId]
            ),
            db.query(
                `SELECT q.id, q.unit_id, q.topic_id, q.co_id, q.question_text, q.bloom_level, q.marks, q.type, q.image_url, q.is_important,
                        co.code as co_code 
                 FROM assessment_questions q
                 LEFT JOIN assessment_course_outcomes co ON q.co_id = co.id
                 JOIN assessment_units u ON q.unit_id = u.id
                 WHERE u.subject_id = $1
                 ORDER BY q.marks ASC, q.created_at DESC`,
                [subjectId]
            ),
            db.query(
                `SELECT id, exam_type, paper_date, max_marks, created_at,
                        sets_data->'metadata'->>'assessment_title' as title
                 FROM assessment_papers
                 WHERE subject_id = $1
                 ORDER BY created_at DESC`,
                [subjectId]
            )
        ]);

        return {
            subject,
            units,
            allTopics,
            allQuestions,
            courseOutcomes,
            practicals,
            papers: papers.map(p => ({
                ...p,
                title: p.title || `${p.exam_type} - ${new Date(p.paper_date).toLocaleDateString()}`
            }))
        };
    } catch (err: any) {
        console.error('[SUBJECT_LOAD] Error:', err);
        throw error(500, err.message);
    }
};
