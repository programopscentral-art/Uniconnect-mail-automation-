import { getAllUniversities, getAccessRequestsByUser } from '@uniconnect/shared';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) throw error(401);

    const [universities, existingRequests] = await Promise.all([
        getAllUniversities(),
        getAccessRequestsByUser(locals.user.id)
    ]);

    return {
        universities,
        existingRequests
    };
};
