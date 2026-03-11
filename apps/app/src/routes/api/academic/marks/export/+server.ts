import { db } from '@uniconnect/shared';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// GET /api/academic/marks/export?subjectId=X&sectionId=Y&examType=Z&format=csv|xlsx
export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const subjectId = url.searchParams.get('subjectId');
    const sectionId = url.searchParams.get('sectionId');
    const examType = url.searchParams.get('examType');

    if (!subjectId || !sectionId) throw error(400, 'subjectId and sectionId required');

    try {
        let query = `SELECT sp.roll_number as "NIAT_ID",
                            COALESCE(u.name, sp.roll_number) as "Student_Name",
                            sm.marks as "Marks_Obtained",
                            sm.total_marks as "Total_Marks",
                            sm.exam_type as "Exam_Type"
                     FROM student_profiles sp
                     LEFT JOIN users u ON sp.user_id = u.id
                     LEFT JOIN student_marks sm ON sm.student_id = sp.id
                        AND sm.subject_id = $1
                        ${examType ? 'AND sm.exam_type = $3' : ''}
                     WHERE sp.section_id = $2
                     ORDER BY sp.roll_number ASC`;

        const params: any[] = [subjectId, sectionId];
        if (examType) params.push(examType);

        const result = await db.query(query, params);

        // Build CSV
        const headers = ['NIAT_ID', 'Student_Name', 'Marks_Obtained', 'Total_Marks', 'Exam_Type'];
        const csvRows = [headers.join(',')];
        for (const row of result.rows) {
            csvRows.push(headers.map(h => {
                const val = row[h] ?? '';
                return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
            }).join(','));
        }

        const csv = csvRows.join('\n');
        return new Response(csv, {
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="marks_export.csv"`
            }
        });
    } catch (e: any) {
        console.error('[GET /api/academic/marks/export]', e.message);
        throw error(500, e.message);
    }
};
