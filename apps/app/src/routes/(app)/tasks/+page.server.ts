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

    const [tasks, users, universities] = await Promise.all([
        getTasks({ university_id: universityId || undefined, status }),
        getAllUsers(),
        getAllUniversities()
    ]);

    return {
        tasks,
        users,
        universities,
        user: locals.user
    };
};
