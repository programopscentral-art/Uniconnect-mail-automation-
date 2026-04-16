import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) throw error(401);
    return {
        user: locals.user,
        userRole: locals.user.role
    };
};
