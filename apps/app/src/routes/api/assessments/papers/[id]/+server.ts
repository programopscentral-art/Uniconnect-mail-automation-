import { db } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);

    const { id } = params;
    const body = await request.json();

    // We expect sets_data to be updated
    const { sets_data, paper_date, duration_minutes, max_marks, exam_type, ...metadata } = body;

    // We store metadata inside the sets_data JSON structure for full persistence
    const setsWithMeta = sets_data ? {
        ...sets_data,
        editor_metadata: metadata
    } : null;

    try {
        const { rows } = await db.query(
            `UPDATE assessment_papers 
             SET sets_data = COALESCE($1, sets_data),
                 paper_date = COALESCE($2, paper_date),
                 duration_minutes = COALESCE($3, duration_minutes::integer),
                 max_marks = COALESCE($4, max_marks::integer),
                 exam_type = COALESCE($5, exam_type),
                 updated_at = NOW()
             WHERE id = $6
             RETURNING *`,
            [
                setsWithMeta ? JSON.stringify(setsWithMeta) : null,
                paper_date,
                duration_minutes,
                max_marks,
                exam_type,
                id
            ]
        );

        if (rows.length === 0) throw error(404, 'Paper not found');

        return json(rows[0]);
    } catch (err: any) {
        console.error('[PAPER_UPDATE_API] Error:', err);
        throw error(500, err.message);
    }
};

export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);

    const { id } = params;

    try {
        const { rows } = await db.query(
            `SELECT p.*, s.name as subject_name, u.name as university_name, b.name as branch_name
             FROM assessment_papers p
             JOIN assessment_subjects s ON p.subject_id = s.id
             JOIN universities u ON p.university_id = u.id
             JOIN assessment_branches b ON p.branch_id = b.id
             WHERE p.id = $1`,
            [id]
        );

        if (rows.length === 0) throw error(404, 'Paper not found');

        return json(rows[0]);
    } catch (err: any) {
        throw error(500, err.message);
    }
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);

    const { id } = params;

    try {
        await db.query('DELETE FROM assessment_papers WHERE id = $1', [id]);
        return json({ success: true });
    } catch (err: any) {
        console.error('[PAPER_DELETE_API] Error:', err);
        throw error(500, err.message);
    }
};
