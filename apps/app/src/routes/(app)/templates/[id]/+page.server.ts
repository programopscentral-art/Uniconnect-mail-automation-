import { getTemplateById, getMetadataKeys, getStudents } from '@uniconnect/shared';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
    if (!locals.user) throw error(401);

    const template = await getTemplateById(params.id);
    if (!template) throw error(404);

    if (locals.user.role === 'UNIVERSITY_OPERATOR' && template.university_id !== locals.user.university_id) {
        throw error(403);
    }

    const universityId = template.university_id;
    let metadataKeys: string[] = [];
    let sampleStudent: any = null;

    if (universityId) {
        metadataKeys = await getMetadataKeys(universityId);
        const students = await getStudents(universityId, 1);
        sampleStudent = students[0] || null;
    }

    return {
        template,
        metadataKeys,
        sampleStudent
    };
};
