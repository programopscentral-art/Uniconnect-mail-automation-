import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) throw error(401);
    const role = locals.user.role;
    const perms: string[] = locals.user.permissions || [];
    if (role !== 'ADMIN' && role !== 'PROGRAM_OPS' && !perms.includes('faculty-attendance')) {
        throw error(403, 'Access denied. Ask your admin to enable Faculty Attendance for your account.');
    }
    return {
        user: locals.user,
        userRole: role,
        universityId: locals.user.university_id || null
    };
};
