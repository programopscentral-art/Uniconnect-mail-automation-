import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user?.permissions?.includes('users')) {
        throw error(403, 'Forbidden');
    }

    const userRole = locals.user.role as any;
    const isGlobalAdmin = userRole === 'ADMIN' || userRole === 'PROGRAM_OPS';

    return {
        userRole,
        isGlobalAdmin,
        user: locals.user
    };
};
