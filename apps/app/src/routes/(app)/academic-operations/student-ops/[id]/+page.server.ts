import { db } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
    if (!locals.user) return { student: null };

    // Get student profile with all joins
    const result = await db.query(
        `SELECT sp.*,
                u.name as student_name, u.email as student_email,
                prog.name as program_name, prog.code as program_code,
                t.name as term_name,
                sec.name as section_name,
                univ.name as university_name, univ.short_name as university_short_name,
                ab.name as batch_name
         FROM student_profiles sp
         LEFT JOIN users u ON sp.user_id = u.id
         LEFT JOIN programs prog ON sp.program_id = prog.id
         LEFT JOIN terms t ON sp.term_id = t.id
         LEFT JOIN sections sec ON sp.section_id = sec.id
         LEFT JOIN universities univ ON sp.university_id = univ.id
         LEFT JOIN academic_batches ab ON sp.batch_id = ab.id
         WHERE sp.id = $1`,
        [params.id]
    );

    if (!result.rows[0]) return { student: null };

    // Get admission workflow
    const wfResult = await db.query(
        `SELECT aw.*, rv.name as reviewer_name
         FROM admission_workflows aw
         LEFT JOIN users rv ON aw.assigned_reviewer_id = rv.id
         WHERE aw.student_profile_id = $1`,
        [params.id]
    );

    // Get document count by type
    const docResult = await db.query(
        `SELECT d.document_type, d.id, d.file_name, d.file_size_bytes, d.uploaded_at, d.is_encrypted,
                sdt.label as type_label, sdt.is_sensitive, sdt.is_required,
                up.name as uploaded_by_name
         FROM documents d
         LEFT JOIN student_document_types sdt ON d.document_type = sdt.code
         LEFT JOIN users up ON d.uploaded_by = up.id
         WHERE d.owner_entity_type = 'STUDENT' AND d.owner_entity_id = $1 AND d.file_status = 'ACTIVE'
         ORDER BY sdt.sort_order ASC`,
        [params.id]
    );

    // Get all required document types
    const typesResult = await db.query(
        'SELECT * FROM student_document_types ORDER BY sort_order ASC'
    );

    return {
        student: result.rows[0],
        workflow: wfResult.rows[0] || null,
        documents: docResult.rows,
        documentTypes: typesResult.rows,
        user: locals.user
    };
};
