import { getTasks, getAllUsers, getAllUniversities } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw error(401);

    let universityId = url.searchParams.get('universityId');

    // AUTO-SCOPE
    if (!universityId && locals.user.university_id) {
        universityId = locals.user.university_id;
    }

    const status = url.searchParams.get('status') as any || undefined;

    const isGlobalAdmin = locals.user.role === 'ADMIN' || locals.user.role === 'PROGRAM_OPS';

    const [tasks, users, universities] = await Promise.all([
        getTasks({
            university_id: universityId || undefined,
            status,
            creator_id: isGlobalAdmin ? undefined : locals.user.id
        }),
        getAllUsers(universityId || undefined),
        getAllUniversities(universityId || undefined)
    ]);

    return {
        tasks,
        users,
        universities,
        user: locals.user
    };
};
