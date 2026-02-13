import { json, error } from '@sveltejs/kit';
import { db } from '@uniconnect/shared';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const universityId = url.searchParams.get('universityId');
    if (!universityId) throw error(400, 'University ID is required');

    try {
        const { rows } = await db.query(`
            SELECT s.* 
            FROM assessment_subjects s
            JOIN assessment_batches b ON s.batch_id = b.id
            WHERE b.university_id = $1
            ORDER BY s.name ASC
        `, [universityId]);

        return json(rows);
    } catch (err: any) {
        throw error(500, err.message);
    }
};
