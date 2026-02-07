import { json, error } from '@sveltejs/kit';
import { db } from '@uniconnect/shared';

export const GET = async ({ params, locals }: { params: any, locals: any }) => {
    if (!locals.user) throw error(401);
    const { id } = params;

    try {
        const { rows: revisions } = await db.query(
            'SELECT * FROM assessment_template_revisions WHERE template_id = $1 ORDER BY created_at DESC',
            [id]
        );
        return json({ success: true, revisions });
    } catch (e: any) {
        console.error(e);
        throw error(500, e.message || 'Failed to fetch revisions');
    }
};
