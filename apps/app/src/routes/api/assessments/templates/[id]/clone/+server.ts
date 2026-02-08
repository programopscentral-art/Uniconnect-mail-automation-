import { json, error } from '@sveltejs/kit';
import { getAssessmentTemplateById, cloneAssessmentTemplate } from '@uniconnect/shared';

export const POST = async ({ params, locals }: { params: { id: string }, locals: any }) => {
    if (!locals.user) throw error(401);
    const { id } = params;

    if (!id) throw error(400, 'ID is required');

    // Verify source exists and user has access
    const existing = await getAssessmentTemplateById(id);
    if (!existing) throw error(404, 'Source template not found');

    // Admins can clone across universities, Operators can only clone their own
    if (locals.user.role !== 'ADMIN' && existing.university_id !== locals.user.university_id) {
        throw error(403, 'Unauthorized: Cannot clone template from another university');
    }

    try {
        // Clone the template by creating a new one with copied data
        const cloned = await cloneAssessmentTemplate(id, locals.user.university_id, locals.user.id);

        console.log(`[TEMPLATE_CLONE] 🚀 Template ${id} cloned to ${cloned.id} for Uni ${cloned.university_id}`);

        return json(cloned);
    } catch (e: any) {
        console.error(`[TEMPLATE_CLONE] ❌ Error:`, e);
        throw error(500, e.message || 'Failed to clone template');
    }
};
