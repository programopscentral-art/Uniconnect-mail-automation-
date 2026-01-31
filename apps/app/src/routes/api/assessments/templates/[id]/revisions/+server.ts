import { json, error } from '@sveltejs/kit';
import { getAssessmentTemplateRevisions } from '@uniconnect/shared';

export const GET = async ({ params, locals }: { params: any, locals: any }) => {
    if (!locals.user) throw error(401);
    const { id } = params;

    try {
        const revisions = await getAssessmentTemplateRevisions(id);
        return json({ success: true, revisions });
    } catch (e: any) {
        console.error(e);
        throw error(500, e.message || 'Failed to fetch revisions');
    }
};
