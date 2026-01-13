import { db } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);
    const subjectId = url.searchParams.get('subjectId');
    if (!subjectId) throw error(400, 'Subject ID is required');

    const { rows } = await db.query(
        'SELECT * FROM assessment_practicals WHERE subject_id = $1 ORDER BY created_at ASC',
        [subjectId]
    );
    return json(rows);
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);
    const { subject_id, name, description } = await request.json();

    if (!subject_id || !name) {
        throw error(400, 'Subject ID and name are required');
    }

    const { rows } = await db.query(
        'INSERT INTO assessment_practicals (subject_id, name, description) VALUES ($1, $2, $3) RETURNING *',
        [subject_id, name, description]
    );
    return json(rows[0]);
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);
    const { id, name, description } = await request.json();

    if (!id) throw error(400, 'ID is required');

    const { rows } = await db.query(
        'UPDATE assessment_practicals SET name = COALESCE($1, name), description = COALESCE($2, description), updated_at = NOW() WHERE id = $3 RETURNING *',
        [name, description, id]
    );
    return json(rows[0]);
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);
    const id = url.searchParams.get('id');
    if (!id) throw error(400, 'ID is required');

    await db.query('DELETE FROM assessment_practicals WHERE id = $1', [id]);
    return json({ success: true });
};
