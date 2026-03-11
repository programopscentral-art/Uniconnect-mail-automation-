import { db } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// GET /api/academic/faculty/teaching-reports?facultyProfileId=X&date=YYYY-MM-DD
export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const facultyProfileId = url.searchParams.get('facultyProfileId');
    const date = url.searchParams.get('date');
    const subjectId = url.searchParams.get('subjectId');
    const sectionId = url.searchParams.get('sectionId');

    let where = 'WHERE 1=1';
    const params: any[] = [];
    let idx = 1;

    if (facultyProfileId) { where += ` AND tr.faculty_profile_id = $${idx++}`; params.push(facultyProfileId); }
    if (date)             { where += ` AND tr.report_date = $${idx++}`; params.push(date); }
    if (subjectId)        { where += ` AND tr.subject_id = $${idx++}`; params.push(subjectId); }
    if (sectionId)        { where += ` AND tr.section_id = $${idx++}`; params.push(sectionId); }

    try {
        const result = await db.query(
            `SELECT tr.*,
                    s.name as subject_name, s.code as subject_code,
                    sec.name as section_name,
                    COALESCE(u.name, fp.employee_code) as faculty_name
             FROM faculty_teaching_reports tr
             LEFT JOIN subjects s ON tr.subject_id = s.id
             LEFT JOIN sections sec ON tr.section_id = sec.id
             LEFT JOIN faculty_profiles fp ON tr.faculty_profile_id = fp.id
             LEFT JOIN users u ON fp.user_id = u.id
             ${where}
             ORDER BY tr.report_date DESC, tr.created_at DESC`,
            params
        );
        return json(result.rows);
    } catch (e: any) {
        console.error('[GET /api/academic/faculty/teaching-reports]', e.message);
        return json([]);
    }
};

// POST — submit a teaching report
export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const { faculty_profile_id, subject_id, section_id, report_date, topic_name, topic_status, portion_percentage, notes } = await request.json();

    if (!faculty_profile_id || !topic_name?.trim()) {
        throw error(400, 'faculty_profile_id and topic_name are required');
    }

    try {
        const res = await db.query(
            `INSERT INTO faculty_teaching_reports
             (faculty_profile_id, subject_id, section_id, report_date, topic_name, topic_status, portion_percentage, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [
                faculty_profile_id,
                subject_id || null,
                section_id || null,
                report_date || new Date().toISOString().split('T')[0],
                topic_name.trim(),
                topic_status || 'COMPLETED',
                portion_percentage ?? 100,
                notes || null
            ]
        );
        return json(res.rows[0]);
    } catch (e: any) {
        console.error('[POST /api/academic/faculty/teaching-reports]', e.message);
        return json({ success: false, message: e.message }, { status: 500 });
    }
};

// DELETE — remove a teaching report
export const DELETE: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const id = url.searchParams.get('id');
    if (!id) throw error(400, 'id is required');

    await db.query('DELETE FROM faculty_teaching_reports WHERE id = $1', [id]);
    return json({ success: true });
};
