/**
 * PM review detail — server load.
 *
 * Auth gate only. The page fetches the submission + values client-side
 * from /api/ops-os/submissions/:id (which is RLS-scoped) so we don't
 * duplicate that read here.
 */
import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
    if (!locals.user) throw redirect(302, '/login');
    const role = locals.user.role as string;
    if (!['ADMIN', 'PROGRAM_OPS', 'PM', 'PMA', 'COS'].includes(role)) {
        throw error(403, 'PM review is available to PM, PMA, COS, PROGRAM_OPS, or ADMIN roles only');
    }
    if (!params.id) throw error(400, 'submission id required');
    return { submission_id: params.id, role };
};
