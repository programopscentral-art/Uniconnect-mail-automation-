/**
 * Operations drill-down — server load.
 *
 * Auth gate only. Page fetches submission + values + events client-side
 * from existing RLS-scoped endpoints.
 */
import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
    if (!locals.user) throw redirect(302, '/login');
    const role = locals.user.role as string;
    if (!['ADMIN', 'PROGRAM_OPS', 'COS', 'PM', 'PMA'].includes(role)) {
        throw error(403, 'Operations drill-down is for COS, PM, PMA, PROGRAM_OPS, or ADMIN');
    }
    if (!params.id) throw error(400, 'submission id required');
    return { submission_id: params.id, role };
};
