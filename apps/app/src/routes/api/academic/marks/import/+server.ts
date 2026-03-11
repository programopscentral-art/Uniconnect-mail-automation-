import { db } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// POST /api/academic/marks/import — bulk import marks via CSV data with NIAT ID matching
export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const { rows, subject_id, section_id, exam_type, total_marks } = await request.json();

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
        throw error(400, 'rows array is required');
    }
    if (!subject_id || !section_id || !exam_type) {
        throw error(400, 'subject_id, section_id, and exam_type are required');
    }

    try {
        let matched = 0;
        let skipped = 0;
        const errors: string[] = [];

        for (const row of rows) {
            const niatId = (row.niat_id || row.roll_number || row.student_id || '').toString().trim();
            const marks = parseFloat(row.marks);

            if (!niatId || isNaN(marks)) {
                skipped++;
                continue;
            }

            // Find student by roll_number (NIAT ID)
            const studentRes = await db.query(
                `SELECT sp.id FROM student_profiles sp
                 WHERE sp.section_id = $1
                 AND UPPER(sp.roll_number) = UPPER($2)`,
                [section_id, niatId]
            );

            if (studentRes.rows.length === 0) {
                errors.push(`Student not found: ${niatId}`);
                skipped++;
                continue;
            }

            const studentId = studentRes.rows[0].id;

            await db.query(
                `INSERT INTO student_marks (student_id, subject_id, section_id, exam_type, marks, total_marks, entered_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 ON CONFLICT (student_id, subject_id, exam_type) DO UPDATE SET
                    marks = EXCLUDED.marks,
                    total_marks = EXCLUDED.total_marks,
                    entered_by = EXCLUDED.entered_by,
                    updated_at = NOW()`,
                [studentId, subject_id, section_id, exam_type, marks, total_marks || null, locals.user.id]
            );
            matched++;
        }

        return json({ success: true, matched, skipped, errors });
    } catch (e: any) {
        console.error('[POST /api/academic/marks/import]', e.message);
        return json({ success: false, message: e.message }, { status: 500 });
    }
};
