import { json, error } from '@sveltejs/kit';
import { db } from '@uniconnect/shared';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);
    const subjectId = url.searchParams.get('subjectId');
    if (!subjectId) throw error(400, 'Subject ID is required');

    const { rows } = await db.query('SELECT * FROM assessment_course_outcomes WHERE subject_id = $1 ORDER BY code ASC', [subjectId]);
    return json(rows);
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);
    const body = await request.json();

    const { rows } = await db.query(
        `INSERT INTO assessment_course_outcomes (subject_id, code, description)
        VALUES ($1, $2, $3)
        RETURNING *`,
        [body.subject_id, body.code, body.description]
    );
    return json(rows[0]);
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);
    const body = await request.json();
    if (!body.id) throw error(400, 'ID is required');

    const { rows } = await db.query(
        `UPDATE assessment_course_outcomes
        SET code = $1, description = $2, updated_at = NOW()
        WHERE id = $3
        RETURNING *`,
        [body.code, body.description, body.id]
    );
    return json(rows[0]);
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
    if (!locals.user || (locals.user.role !== 'UNIVERSITY_OPERATOR' && locals.user.role !== 'ADMIN')) throw error(401);
    const id = url.searchParams.get('id');
    if (!id) throw error(400, 'ID is required');

    await db.query('DELETE FROM assessment_course_outcomes WHERE id = $1', [id]);
    return json({ success: true });
};
