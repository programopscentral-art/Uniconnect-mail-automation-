import { getTemplateById, updateTemplate, deleteTemplate } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);
    const t = await getTemplateById(params.id);
    if (!t) throw error(404);

    if (locals.user.role === 'UNIVERSITY_OPERATOR' && t.university_id !== locals.user.university_id) {
        throw error(403);
    }
    return json(t);
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);

    // RBAC Check
    const t = await getTemplateById(params.id);
    if (!t) throw error(404);
    if (locals.user.role === 'UNIVERSITY_OPERATOR' && t.university_id !== locals.user.university_id) {
        throw error(403);
    }

    const data = await request.json();
    const updated = await updateTemplate(params.id, data);
    return json(updated);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);

    // RBAC Check
    const t = await getTemplateById(params.id);
    if (!t) throw error(404);
    if (locals.user.role === 'UNIVERSITY_OPERATOR' && t.university_id !== locals.user.university_id) {
        throw error(403);
    }

    await deleteTemplate(params.id);
    return json({ success: true });
};
