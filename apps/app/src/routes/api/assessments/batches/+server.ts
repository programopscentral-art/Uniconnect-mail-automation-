import { db } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const body = await request.json();
    if (!body.university_id || !body.name) {
        throw error(400, 'University ID and Batch Name are required');
    }

    if (locals.user.role === 'UNIVERSITY_OPERATOR' && locals.user.university_id !== body.university_id) {
        throw error(403, 'Unauthorized for this university');
    }

    try {
        const { rows } = await db.query(
            `INSERT INTO assessment_batches (university_id, name, year, is_active)
            VALUES ($1, $2, $3, $4)
            RETURNING *`,
            [body.university_id, body.name, body.year || new Date().getFullYear(), body.is_active ?? true]
        );
        return json(rows[0]);
    } catch (err: any) {
        throw error(500, err.message);
    }
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const body = await request.json();
    if (!body.id || !body.name) {
        throw error(400, 'ID and Name are required');
    }

    try {
        const { rows } = await db.query(
            `UPDATE assessment_batches
            SET name = $1, year = $2, is_active = $3, updated_at = NOW()
            WHERE id = $4
            RETURNING *`,
            [body.name, body.year, body.is_active, body.id]
        );
        return json(rows[0]);
    } catch (err: any) {
        throw error(500, err.message);
    }
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const id = url.searchParams.get('id');
    if (!id) throw error(400, 'ID is required');

    try {
        await db.query('DELETE FROM assessment_batches WHERE id = $1', [id]);
        return json({ success: true });
    } catch (err: any) {
        throw error(500, err.message);
    }
};
