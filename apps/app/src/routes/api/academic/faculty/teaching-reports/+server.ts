import { db } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Auto-create table if it doesn't exist
let _migrated = false;
async function ensureTable() {
    if (_migrated) return;
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS faculty_teaching_reports (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                faculty_profile_id UUID NOT NULL REFERENCES faculty_profiles(id) ON DELETE CASCADE,
                subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
                section_id UUID REFERENCES sections(id) ON DELETE SET NULL,
                report_date DATE NOT NULL DEFAULT CURRENT_DATE,
                topic_name TEXT NOT NULL,
                topic_status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (topic_status IN ('COMPLETED', 'PARTIAL', 'INTRODUCED')),
                portion_percentage NUMERIC(5,2) DEFAULT 100,
                notes TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        // Also ensure syllabus topics table exists
        await db.query(`
            CREATE TABLE IF NOT EXISTS subject_syllabus_topics (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
                topic_name TEXT NOT NULL,
                topic_order INTEGER DEFAULT 0,
                estimated_sessions INTEGER DEFAULT 1,
                is_completed BOOLEAN DEFAULT FALSE,
                completed_at TIMESTAMPTZ,
                completed_by UUID REFERENCES faculty_profiles(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(subject_id, topic_name)
            )
        `);
        _migrated = true;
    } catch { _migrated = true; }
}

// GET /api/academic/faculty/teaching-reports?facultyProfileId=X&date=YYYY-MM-DD
export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');
    await ensureTable();

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
    await ensureTable();

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

// PATCH — edit an existing teaching report
export const PATCH: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');
    await ensureTable();

    const { id, topic_name, topic_status, portion_percentage, notes, subject_id, section_id, report_date } = await request.json();
    if (!id) throw error(400, 'id is required');

    try {
        const res = await db.query(
            `UPDATE faculty_teaching_reports
             SET topic_name = COALESCE($2, topic_name),
                 topic_status = COALESCE($3, topic_status),
                 portion_percentage = COALESCE($4, portion_percentage),
                 notes = $5,
                 subject_id = COALESCE($6, subject_id),
                 section_id = COALESCE($7, section_id),
                 report_date = COALESCE($8, report_date),
                 updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [id, topic_name?.trim() || null, topic_status || null, portion_percentage ?? null, notes ?? null, subject_id || null, section_id || null, report_date || null]
        );
        if (!res.rows[0]) throw error(404, 'Report not found');
        return json(res.rows[0]);
    } catch (e: any) {
        console.error('[PATCH /api/academic/faculty/teaching-reports]', e.message);
        return json({ success: false, message: e.message }, { status: 500 });
    }
};

// DELETE — remove a teaching report
export const DELETE: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');
    await ensureTable();

    const id = url.searchParams.get('id');
    if (!id) throw error(400, 'id is required');

    await db.query('DELETE FROM faculty_teaching_reports WHERE id = $1', [id]);
    return json({ success: true });
};
