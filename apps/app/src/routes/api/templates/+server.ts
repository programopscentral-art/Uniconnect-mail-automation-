import { getTemplates, createTemplate, getAllUniversities } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);
    let universityId = url.searchParams.get('universityId');

    if (locals.user.role === 'UNIVERSITY_OPERATOR') {
        universityId = locals.user.university_id;
    }

    if (!universityId) throw error(400, 'University ID required');

    const templates = await getTemplates(universityId);
    return json(templates);
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);
    const data = await request.json();

    let universityId = data.universityId;
    if (locals.user.role === 'UNIVERSITY_OPERATOR') {
        universityId = locals.user.university_id;
    }

    if (!universityId) throw error(400, 'University ID required');

    const template = await createTemplate({
        university_id: universityId as string,
        name: data.name,
        subject: data.subject,
        html: data.html,
        config: data.config || {},
        created_by_user_id: locals.user.id
    });
    return json(template);
};
