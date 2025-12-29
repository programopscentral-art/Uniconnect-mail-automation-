import { redirect } from '@sveltejs/kit';
import { getUserStats, getUserAuditLogs } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) {
        throw redirect(302, '/login');
    }

    const stats = await getUserStats(locals.user.id);
    const auditLogs = await getUserAuditLogs(locals.user.id);

    return {
        user: locals.user,
        stats,
        auditLogs
    };
};
