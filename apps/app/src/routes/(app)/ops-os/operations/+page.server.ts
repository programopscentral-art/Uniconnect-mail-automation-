/**
 * Operations Overview — server load.
 *
 * Auth gate + resolve the list of active campuses for the filter dropdown.
 * The actual overview rows are fetched client-side from
 * /api/ops-os/operations/daily so filters can be tweaked without reloading.
 */
import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { withReadOnlyUserContext } from '@uniconnect/shared';

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) throw redirect(302, '/login');
    const role = locals.user.role as string;
    if (!['ADMIN', 'PROGRAM_OPS', 'COS'].includes(role)) {
        throw error(403, 'Operations Overview is for COS, PROGRAM_OPS, or ADMIN roles');
    }
    const userId = locals.user.id as string;

    const campuses = await withReadOnlyUserContext(userId, role, async (client) => {
        const r = await client.query<{ campus_id: string; code: string; display_name: string }>(
            `SELECT campus_id, code, display_name
             FROM ops_os.campus_dim
             WHERE status = 'active'
             ORDER BY display_name`,
        );
        return r.rows;
    });

    const today = new Date().toISOString().slice(0, 10);
    return { campuses, today, role };
};
