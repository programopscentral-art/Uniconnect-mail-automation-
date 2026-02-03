import { deleteTemplate, getTemplateById } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const DELETE: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);

    console.log(`[TEMPLATE_DELETE] 🗑️ Request to delete template: ${params.id}`);

    try {
        const t = await getTemplateById(params.id);
        if (!t) {
            console.warn(`[TEMPLATE_DELETE] ⚠️ Template ${params.id} not found`);
            throw error(404, 'Template not found');
        }

        // RBAC Check
        if (locals.user.role === 'UNIVERSITY_OPERATOR' && t.university_id !== locals.user.university_id) {
            console.error(`[TEMPLATE_DELETE] ❌ Forbidden: User ${locals.user.id} trying to delete template ${params.id}`);
            throw error(403, 'Forbidden');
        }

        await deleteTemplate(params.id);
        console.log(`[TEMPLATE_DELETE] ✅ Template ${params.id} successfully deleted`);

        return new Response(null, { status: 204 });
    } catch (e: any) {
        console.error(`[TEMPLATE_DELETE] ❌ Error deleting template:`, e);
        return json({
            success: false,
            message: e.message || 'Failed to delete template',
            detail: e.stack
        }, { status: e.status || 500 });
    }
};
