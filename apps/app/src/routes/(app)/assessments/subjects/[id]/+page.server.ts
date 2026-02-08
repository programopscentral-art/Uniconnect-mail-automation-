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

        // Fetch Units
        const units = await getAssessmentUnits(subjectId);

        // Fetch Topics for all units in one go for efficiency
        const { rows: allTopics } = await db.query(
            `SELECT t.* FROM assessment_topics t
             JOIN assessment_units u ON t.unit_id = u.id
             WHERE u.subject_id = $1
             ORDER BY t.name ASC`,
            [subjectId]
        );

        // Fetch Course Outcomes
        const { rows: courseOutcomes } = await db.query(
            'SELECT * FROM assessment_course_outcomes WHERE subject_id = $1 ORDER BY code ASC',
            [subjectId]
        );

        // Fetch Practicals
        const { rows: practicals } = await db.query(
            'SELECT * FROM assessment_practicals WHERE subject_id = $1 ORDER BY created_at ASC',
            [subjectId]
        );

        // Fetch all Questions for these units
        const { rows: allQuestions } = await db.query(
            `SELECT q.*, co.code as co_code 
             FROM assessment_questions q
             LEFT JOIN assessment_course_outcomes co ON q.co_id = co.id
             JOIN assessment_units u ON q.unit_id = u.id
             WHERE u.subject_id = $1
             ORDER BY q.marks ASC, q.created_at DESC`,
            [subjectId]
        );

        // Fetch Saved Papers
        const { rows: papers } = await db.query(
            `SELECT id, exam_type, paper_date, max_marks, created_at,
                    sets_data->'metadata'->>'assessment_title' as title
             FROM assessment_papers
             WHERE subject_id = $1
             ORDER BY created_at DESC`,
            [subjectId]
        );

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
