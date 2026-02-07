import { json, error } from '@sveltejs/kit';
import { db } from '@uniconnect/shared';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const branchId = url.searchParams.get('branchId');
    const batchId = url.searchParams.get('batchId');
    const semester = url.searchParams.get('semester');

    if (!branchId) {
        throw error(400, 'Branch ID is required');
    }

    try {
        let query = 'SELECT * FROM assessment_subjects WHERE branch_id = $1';
        const params: any[] = [branchId];

        if (semester) {
            params.push(parseInt(semester));
            query += ` AND semester = $${params.length}`;
        }

        if (batchId) {
            params.push(batchId);
            query += ` AND batch_id = $${params.length}`;
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
    if (!body.branch_id || !body.name) {
        throw error(400, 'Branch ID and Subject Name are required');
    }

    try {
        const { rows } = await db.query(
            `INSERT INTO assessment_subjects (branch_id, batch_id, name, code, semester, credits)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *`,
            [body.branch_id, body.batch_id, body.name, body.code, body.semester, body.credits]
        );
        return json(rows[0]);
    } catch (err: any) {
        throw error(500, err.message);
    }
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const body = await request.json();
    if (!body.id) {
        throw error(400, 'ID is required');
    }

    try {
        const { rows } = await db.query(
            `UPDATE assessment_subjects
            SET name = $1, code = $2, semester = $3, credits = $4, updated_at = NOW()
            WHERE id = $5
            RETURNING *`,
            [body.name, body.code, body.semester, body.credits, body.id]
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
        await db.query('DELETE FROM assessment_subjects WHERE id = $1', [id]);
        return json({ success: true });
    } catch (err: any) {
        throw error(500, err.message);
    }
};
