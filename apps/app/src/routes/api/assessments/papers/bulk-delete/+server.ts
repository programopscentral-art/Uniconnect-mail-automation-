import { db } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const { ids } = await request.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        throw error(400, 'Invalid IDs provided');
    }

    try {
        await db.query('DELETE FROM assessment_papers WHERE id = ANY($1)', [ids]);
        return json({ success: true, deletedCount: ids.length });
    } catch (err: any) {
        console.error('[PAPER_BULK_DELETE_API] Error:', err);
        throw error(500, err.message);
    }
};
