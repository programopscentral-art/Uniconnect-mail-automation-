import { json, error } from '@sveltejs/kit';
import { db } from '@uniconnect/shared';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const body = await request.json();
    if (!body.subject_id || !body.unit_number) {
        throw error(400, 'Subject ID and Unit Number are required');
    }

    try {
        const { rows } = await db.query(
            `INSERT INTO assessment_units (subject_id, unit_number, name)
            VALUES ($1, $2, $3)
            RETURNING *`,
            [body.subject_id, body.unit_number, body.name]
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
        await db.query('DELETE FROM assessment_units WHERE id = $1', [id]);
        return json({ success: true });
    } catch (err: any) {
        throw error(500, err.message);
    }
};
