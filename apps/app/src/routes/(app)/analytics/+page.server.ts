import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) throw error(401);

    const isGlobalOps = ['ADMIN', 'PROGRAM_OPS'].includes(locals.user.role as string);

    return {
        user: {
            id: locals.user.id,
            name: locals.user.name,
            email: locals.user.email,
            role: locals.user.role,
            university_id: locals.user.university_id,
        },
        isGlobalOps,
    };
};
