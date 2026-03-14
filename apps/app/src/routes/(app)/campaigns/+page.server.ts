import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw error(401);

    let universityId = url.searchParams.get('universityId');
    if (!universityId && locals.user.university_id) {
        universityId = locals.user.university_id;
    }

    return {
        selectedUniversityId: universityId,
        userRole: locals.user.role,
        userPermissions: locals.user.permissions || [],
        user: locals.user
    };
};
