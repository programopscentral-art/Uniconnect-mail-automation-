import { error } from '@sveltejs/kit';
import { getAllUniversities } from '@uniconnect/shared';

export const load = async ({ locals }: { locals: any }) => {
    if (!locals.user) throw error(401);

    // Check for niat-planner permission
    if (!locals.user.permissions?.includes('niat-planner') && locals.user.role !== 'ADMIN') {
        throw error(403, 'You do not have permission to access NIAT Planner');
    }

    const universities = await getAllUniversities();

    return {
        user: locals.user,
        universities
    };
};
