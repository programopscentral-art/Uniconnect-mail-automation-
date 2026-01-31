import { json, error } from '@sveltejs/kit';
import {
    getAssessmentTemplates,
    getAssessmentTemplateById,
    createAssessmentTemplate,
    updateAssessmentTemplate,
    deleteAssessmentTemplate
} from '@uniconnect/shared';

export const GET = async ({ url, locals }: { url: URL, locals: any }) => {
    if (!locals.user) throw error(401);
    const universityId = url.searchParams.get('universityId') || locals.user.university_id;
    if (!universityId) throw error(400, 'University ID is required');

    const templates = await getAssessmentTemplates(universityId);
    return json(templates);
};

export const POST = async ({ request, locals }: { request: Request, locals: any }) => {
    if (!locals.user) throw error(401);
    const body = await request.json();

    if (!body.university_id) body.university_id = locals.user.university_id;
    body.created_by = locals.user.id;

    const template = await createAssessmentTemplate(body);
    return json(template);
};

export const PATCH = async ({ request, locals }: { request: Request, locals: any }) => {
    if (!locals.user) throw error(401);
    const body = await request.json();
    if (!body.id) throw error(400, 'ID is required');

    // SECURITY CHECK: Hard Isolation
    const universityId = locals.user.university_id;
    if (!universityId) throw error(400, 'University ID is missing from user session');

    // Passing universityId to ensure update is restricted to the owner university
    const template = await updateAssessmentTemplate(body.id, {
        ...body,
        updated_by: locals.user.id
    }, universityId);

    if (!template) throw error(404, 'Template not found or access denied');
    return json(template);
};

export const DELETE = async ({ url, locals }: { url: URL, locals: any }) => {
    if (!locals.user || (locals.user.role !== 'UNIVERSITY_OPERATOR' && locals.user.role !== 'ADMIN')) throw error(401);
    const id = url.searchParams.get('id');
    if (!id) throw error(400, 'ID is required');

    const universityId = locals.user.university_id;
    if (!universityId && locals.user.role !== 'ADMIN') throw error(400, 'University ID is required');

    await deleteAssessmentTemplate(id, universityId);
    return json({ success: true });
};
