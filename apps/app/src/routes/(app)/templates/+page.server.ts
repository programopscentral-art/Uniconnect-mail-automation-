import { getTemplates, getAllUniversities } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw error(401);

    let universityId = url.searchParams.get('universityId');
    if (locals.user.role === 'UNIVERSITY_OPERATOR') {
        universityId = locals.user.university_id;
    } else if (!universityId && locals.user.university_id) {
        universityId = locals.user.university_id;
    }

    const [templates, universities] = await Promise.all([
        getTemplates(universityId || undefined),
        locals.user.role === 'ADMIN' || locals.user.role === 'PROGRAM_OPS' ? getAllUniversities() : Promise.resolve([])
    ]);

    return {
        templates,
        universities,
        selectedUniversityId: universityId,
        userRole: locals.user.role
    };
};
