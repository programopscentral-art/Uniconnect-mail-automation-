import { db } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// POST /api/academic/marks — bulk save marks
export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const { entries } = await request.json();
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
        throw error(400, 'entries array is required');
    }

    try {
        // Ensure marks table exists
        await db.query(`
            CREATE TABLE IF NOT EXISTS student_marks (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                student_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
                subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
                section_id UUID REFERENCES sections(id) ON DELETE SET NULL,
                exam_type TEXT NOT NULL,
                marks NUMERIC(6,2) NOT NULL,
                entered_by UUID REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(student_id, subject_id, exam_type)
            )
        `);

        const values: string[] = [];
        const params: any[] = [];
        let idx = 1;

        for (const e of entries) {
            values.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
            params.push(e.student_id, e.subject_id, e.section_id || null, e.exam_type, e.marks, locals.user.id);
        }

        await db.query(
            `INSERT INTO student_marks (student_id, subject_id, section_id, exam_type, marks, entered_by)
             VALUES ${values.join(', ')}
             ON CONFLICT (student_id, subject_id, exam_type) DO UPDATE SET
                marks = EXCLUDED.marks,
                entered_by = EXCLUDED.entered_by,
                updated_at = NOW()`,
            params
        );

        return json({ success: true, count: entries.length });
    } catch (e: any) {
        console.error('[POST /api/academic/marks]', e.message);
        return json({ success: false, message: e.message }, { status: 500 });
    }
};

// GET /api/academic/marks?subjectId=X&sectionId=Y&examType=Z
export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const subjectId = url.searchParams.get('subjectId');
    const sectionId = url.searchParams.get('sectionId');
    const examType = url.searchParams.get('examType');

    if (!subjectId || !sectionId) throw error(400, 'subjectId and sectionId are required');

    try {
        let query = `SELECT sm.*, sp.roll_number, u.name as student_name
             FROM student_marks sm
             JOIN student_profiles sp ON sp.id = sm.student_id
             LEFT JOIN users u ON sp.user_id = u.id
             WHERE sm.subject_id = $1 AND sm.section_id = $2`;
        const params: any[] = [subjectId, sectionId];

        if (examType) {
            query += ` AND sm.exam_type = $3`;
            params.push(examType);
        }

        query += ` ORDER BY sp.roll_number ASC`;

        const result = await db.query(query, params);
        return json(result.rows);
    } catch (e: any) {
        console.error('[GET /api/academic/marks]', e.message);
        return json([]);
    }
};
