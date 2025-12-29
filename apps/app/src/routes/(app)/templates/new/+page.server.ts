import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getMetadataKeys, getStudents } from '@uniconnect/shared';

export const load: PageServerLoad = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    let universityId = url.searchParams.get('universityId');
    if (locals.user.role === 'UNIVERSITY_OPERATOR') {
        universityId = locals.user.university_id;
    }

    if (!universityId) {
        throw error(400, 'University ID required');
    }

    const metadataKeys = await getMetadataKeys(universityId);
    const sampleStudents = await getStudents(universityId, 1);

    return {
        universityId,
        userRole: locals.user.role,
        metadataKeys,
        sampleStudent: sampleStudents[0] || null
    };
};
