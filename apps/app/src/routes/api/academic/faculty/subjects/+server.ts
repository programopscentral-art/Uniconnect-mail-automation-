import { db } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// GET /api/academic/faculty/subjects?universityId=X&termId=Y&programId=Z
// Returns all faculty with their subject assignments for a given university/term
export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const universityId = url.searchParams.get('universityId') || locals.user.university_id;
    if (!universityId) throw error(400, 'universityId is required');

    const termId = url.searchParams.get('termId');
    const programId = url.searchParams.get('programId');

    // Build subject filter
    let subjectFilter = 's.university_id = $1';
    const params: any[] = [universityId];
    let idx = 2;

    if (termId) {
        subjectFilter += ` AND s.term_id = $${idx++}`;
        params.push(termId);
    }
    if (programId) {
        subjectFilter += ` AND s.program_id = $${idx++}`;
        params.push(programId);
    }

    const result = await db.query(
        `SELECT
            fp.id,
            fp.employee_code,
            fp.department,
            fp.designation,
            fp.specialization,
            u.full_name as name,
            u.email,
            COALESCE(json_agg(
                json_build_object(
                    'mapping_id', fsm.id,
                    'subject_id', s.id,
                    'subject_name', s.name,
                    'subject_code', s.code,
                    'term_id', s.term_id,
                    'term_name', t.name,
                    'program_id', s.program_id,
                    'program_name', p.name,
                    'total_sessions', s.total_sessions_required,
                    'credit_value', s.credit_value,
                    'can_substitute', fsm.can_substitute
                ) ORDER BY t.start_date, s.name
            ) FILTER (WHERE fsm.id IS NOT NULL), '[]') as subjects
         FROM faculty_profiles fp
         JOIN users u ON fp.user_id = u.id
         LEFT JOIN faculty_subject_mappings fsm ON fsm.faculty_profile_id = fp.id
         LEFT JOIN subjects s ON fsm.subject_id = s.id AND (${subjectFilter})
         LEFT JOIN terms t ON s.term_id = t.id
         LEFT JOIN programs p ON s.program_id = p.id
         WHERE fp.university_id = $1 AND fp.is_active = true
         GROUP BY fp.id, fp.employee_code, fp.department, fp.designation, fp.specialization, u.full_name, u.email
         ORDER BY u.full_name ASC`,
        params
    );

    return json(result.rows);
};

// POST /api/academic/faculty/subjects — assign a subject to faculty
export const POST: RequestHandler = async ({ request, locals }) => {
    if (locals.user?.role !== 'ADMIN' && locals.user?.role !== 'PROGRAM_OPS') {
        throw error(403, 'Forbidden');
    }

    const { faculty_profile_id, subject_id, can_substitute } = await request.json();
    if (!faculty_profile_id || !subject_id) throw error(400, 'faculty_profile_id and subject_id are required');

    // Check for duplicate
    const existing = await db.query(
        'SELECT id FROM faculty_subject_mappings WHERE faculty_profile_id = $1 AND subject_id = $2',
        [faculty_profile_id, subject_id]
    );
    if (existing.rows.length > 0) {
        return json({ id: existing.rows[0].id, already_exists: true });
    }

    const res = await db.query(
        `INSERT INTO faculty_subject_mappings (faculty_profile_id, subject_id, can_substitute)
         VALUES ($1, $2, $3) RETURNING *`,
        [faculty_profile_id, subject_id, can_substitute ?? false]
    );
    return json(res.rows[0]);
};

// DELETE /api/academic/faculty/subjects?mappingId=X
export const DELETE: RequestHandler = async ({ url, locals }) => {
    if (locals.user?.role !== 'ADMIN' && locals.user?.role !== 'PROGRAM_OPS') {
        throw error(403, 'Forbidden');
    }

    const mappingId = url.searchParams.get('mappingId');
    if (!mappingId) throw error(400, 'mappingId is required');

    await db.query('DELETE FROM faculty_subject_mappings WHERE id = $1', [mappingId]);
    return json({ success: true });
};
