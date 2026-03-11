import { db } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// GET /api/academic/faculty/known-subjects?facultyProfileId=X
export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const facultyProfileId = url.searchParams.get('facultyProfileId');
    if (!facultyProfileId) throw error(400, 'facultyProfileId is required');

    try {
        const result = await db.query(
            `SELECT id, subject_name, proficiency_level, notes, created_at
             FROM faculty_known_subjects
             WHERE faculty_profile_id = $1
             ORDER BY subject_name ASC`,
            [facultyProfileId]
        );
        return json(result.rows);
    } catch (e: any) {
        console.error('[GET /api/academic/faculty/known-subjects]', e.message);
        return json([]);
    }
};

// POST — add a known subject
export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const { faculty_profile_id, subject_name, proficiency_level, notes } = await request.json();
    if (!faculty_profile_id || !subject_name?.trim()) {
        throw error(400, 'faculty_profile_id and subject_name are required');
    }

    try {
        const res = await db.query(
            `INSERT INTO faculty_known_subjects (faculty_profile_id, subject_name, proficiency_level, notes)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (faculty_profile_id, subject_name) DO UPDATE SET
                proficiency_level = EXCLUDED.proficiency_level,
                notes = EXCLUDED.notes
             RETURNING *`,
            [faculty_profile_id, subject_name.trim(), proficiency_level || 'PROFICIENT', notes || null]
        );
        return json(res.rows[0]);
    } catch (e: any) {
        console.error('[POST /api/academic/faculty/known-subjects]', e.message);
        return json({ success: false, message: e.message }, { status: 500 });
    }
};

// DELETE — remove a known subject
export const DELETE: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const id = url.searchParams.get('id');
    if (!id) throw error(400, 'id is required');

    await db.query('DELETE FROM faculty_known_subjects WHERE id = $1', [id]);
    return json({ success: true });
};
