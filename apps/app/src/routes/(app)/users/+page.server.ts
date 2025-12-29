import { getAllUsers, getAllUniversities, getAllAccessRequests } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
    const userRole = locals.user?.role as any;
    if (userRole !== 'ADMIN' && userRole !== 'PROGRAM_OPS' && userRole !== 'UNIVERSITY_OPERATOR') {
        throw error(403, 'Forbidden');
    }

    const isGlobalAdmin = userRole === 'ADMIN' || userRole === 'PROGRAM_OPS';
    const universityFilter = isGlobalAdmin ? undefined : locals.user?.university_id || 'NONE';

    const [users, universities, accessRequests] = await Promise.all([
        getAllUsers(universityFilter || undefined),
        isGlobalAdmin ? getAllUniversities() : Promise.resolve([]),
        isGlobalAdmin ? getAllAccessRequests() : Promise.resolve([])
    ]);

    return {
        users,
        universities,
        accessRequests,
        userRole,
        isGlobalAdmin
    };
};
