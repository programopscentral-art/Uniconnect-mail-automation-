import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) throw error(401);

    return {
        userRole: locals.user.role,
        userId: locals.user.id,
        userUniversityId: locals.user.university_id,
        user: locals.user
    };
};
