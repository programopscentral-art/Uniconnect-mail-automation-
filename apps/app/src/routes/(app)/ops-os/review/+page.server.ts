/**
 * PM review queue — server load.
 *
 * Verifies the caller has 'review' authority and resolves a campus filter
 * list from their PM assignments (for the optional campus dropdown).
 * The actual row list is fetched client-side from /api/ops-os/submissions/list
 * so filters can update without a full reload.
 */
import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { withReadOnlyUserContext } from '@uniconnect/shared';

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) throw redirect(302, '/login');
    const role = locals.user.role as string;
    if (!['ADMIN', 'PROGRAM_OPS', 'PM', 'PMA', 'COS'].includes(role)) {
        throw error(403, 'PM review is available to PM, PMA, COS, PROGRAM_OPS, or ADMIN roles only');
    }

    const userId = locals.user.id as string;

    const campuses = await withReadOnlyUserContext(userId, role, async (client) => {
        // PM/PMA: show only their assigned campuses. COS/ADMIN/PROGRAM_OPS: show all active.
        if (role === 'PM' || role === 'PMA') {
            const r = await client.query<{ campus_id: string; code: string; display_name: string }>(
                `SELECT c.campus_id, c.code, c.display_name
                 FROM ops_os.campus_dim c
                 JOIN ops_os.user_campus_assignment uca
                      ON uca.campus_id = c.campus_id
                     AND uca.user_id = $1
                     AND uca.role = 'PM'
                     AND uca.revoked_at IS NULL
                 WHERE c.status = 'active'
                 ORDER BY c.display_name`,
                [userId],
            );
            return r.rows;
        }
        const r = await client.query<{ campus_id: string; code: string; display_name: string }>(
            `SELECT campus_id, code, display_name FROM ops_os.campus_dim
             WHERE status = 'active' ORDER BY display_name`,
        );
        return r.rows;
    });

    return { campuses, role };
};
