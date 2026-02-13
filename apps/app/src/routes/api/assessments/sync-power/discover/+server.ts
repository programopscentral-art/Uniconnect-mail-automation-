import { json, error } from '@sveltejs/kit';
import { db } from '@uniconnect/shared';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const subjectId = url.searchParams.get('subjectId');
    if (!subjectId) throw error(400, 'Subject ID is required');

    try {
        // 1. Get the source subject name
        const { rows: [sourceSubject] } = await db.query(
            'SELECT name FROM assessment_subjects WHERE id = $1',
            [subjectId]
        );

        if (!sourceSubject) throw error(404, 'Subject not found');

        // 2. Find all universities that have a subject with the same name
        // We only want to return universities other than the current one (implied by the caller's context, but let's just return all matches and exclude the current university ID if provided)
        const excludeUniversityId = url.searchParams.get('excludeUniversityId');

        const { rows: matches } = await db.query(`
            SELECT DISTINCT u.id, u.name, 
                   (SELECT count(*) FROM assessment_questions q 
                    JOIN assessment_units un ON q.unit_id = un.id 
                    WHERE un.subject_id = s.id) as question_count
            FROM universities u
            JOIN assessment_batches b ON b.university_id = u.id
            JOIN assessment_subjects s ON s.batch_id = b.id
            WHERE s.name = $1 AND u.id != $2
        `, [sourceSubject.name, excludeUniversityId || '']);

        return json({
            subjectName: sourceSubject.name,
            matches
        });
    } catch (err: any) {
        throw error(500, err.message);
    }
};
