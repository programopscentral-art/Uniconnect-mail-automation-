import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) throw error(401);

    // Check for niat-planner permission
    if (!locals.user.permissions?.includes('niat-planner') && locals.user.role !== 'ADMIN') {
        throw error(403, 'You do not have permission to access NIAT Planner');
    }

    return {
        user: locals.user
    };
};
