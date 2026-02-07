import { db } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';


export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const universityId = url.searchParams.get('universityId');
    const batchId = url.searchParams.get('batchId');

    if (!universityId) {
        throw error(400, 'University ID is required');
    }

    try {
        let query = 'SELECT * FROM assessment_branches WHERE university_id = $1';
        const params = [universityId];

        if (batchId) {
            query += ' AND batch_id = $2';
            params.push(batchId);
        }

        query += ' ORDER BY name ASC';

        const { rows } = await db.query(query, params);
        return json(rows);
    } catch (err: any) {
        throw error(500, err.message);
    }
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const body = await request.json();
    if (!body.university_id || !body.name) {
        throw error(400, 'University ID and Branch Name are required');
    }

    if (locals.user.role === 'UNIVERSITY_OPERATOR' && locals.user.university_id !== body.university_id) {
        throw error(403, 'Unauthorized for this university');
    }

    try {
        const { rows } = await db.query(
            `INSERT INTO assessment_branches (university_id, batch_id, name, code)
            VALUES ($1, $2, $3, $4)
            RETURNING *`,
            [body.university_id, body.batch_id, body.name, body.code]
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
            `UPDATE assessment_branches
            SET name = $1, code = $2, updated_at = NOW()
            WHERE id = $3
            RETURNING *`,
            [body.name, body.code, body.id]
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
        await db.query('DELETE FROM assessment_branches WHERE id = $1', [id]);
        return json({ success: true });
    } catch (err: any) {
        throw error(500, err.message);
    }
};
