import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '@uniconnect/shared';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const universityId = url.searchParams.get('universityId');
    const semester = url.searchParams.get('semester');

    if (!universityId || !semester) {
        throw error(400, 'universityId and semester are required');
    }

    try {
        // 1. Fetch SemesterCourses (assessment_subjects)
        // We need to join with branches to filter by university
        const coursesResult = await db.query(`
            SELECT 
                s.id as semester_course_id, 
                s.name as title, 
                s.syllabus_content as description,
                s.semester as semester_name,
                s.code as source_code
            FROM assessment_subjects s
            JOIN assessment_branches b ON s.branch_id = b.id
            WHERE b.university_id = $1 AND s.semester = $2
        `, [universityId, semester]);

        const courseIds = coursesResult.rows.map(r => r.semester_course_id);

        // 2. Fetch Sessions (assessment_units / topics)
        // For now, let's treat units as sessions or topics as sessions?
        // the user's Session sheet has session_type (LECTURE/PRACTICE/EXAM)
        // topics don't have this, but units might be a better fit if mapped.
        // However, sessions are often topics. Let's fetch both or one.
        // I'll fetch units for now or topics linked to these subjects.

        const sessionsResult = await db.query(`
            SELECT 
                t.id as session_id,
                t.name as session_name,
                t.name as session_plan_name,
                'LECTURE' as session_type, -- Default
                3600 as duration_in_seconds -- Default
            FROM assessment_topics t
            JOIN assessment_units u ON t.unit_id = u.id
            WHERE u.subject_id = ANY($1)
        `, [courseIds]);

        // 3. Mapping (SemesterCourseSession)
        const mappingResult = await db.query(`
            SELECT 
                u.subject_id as semester_course_id,
                t.id as session_id,
                1 as week_count
            FROM assessment_topics t
            JOIN assessment_units u ON t.unit_id = u.id
            WHERE u.subject_id = ANY($1)
        `, [courseIds]);

        return json({
            courses: coursesResult.rows,
            sessions: sessionsResult.rows,
            resources: [], // Placeholder
            course_sessions: mappingResult.rows
        });
    } catch (e: any) {
        console.error('CONTENT_EXPORT_DB_ERROR:', e);
        throw error(500, e.message);
    }
};
