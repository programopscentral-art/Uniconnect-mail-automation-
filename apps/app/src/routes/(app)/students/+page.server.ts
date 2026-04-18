import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw error(401);

    // Respect the dropdown selection. Only default to primary if nothing selected.
    let universityId = url.searchParams.get('universityId');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');

    if (!universityId && locals.user.university_id) {
        universityId = locals.user.university_id;
    }

    return {
        currentPage: page,
        limit,
        selectedUniversityId: universityId,
        userRole: locals.user.role,
        userUniversityId: locals.user.university_id,
        user: locals.user
    };
};
