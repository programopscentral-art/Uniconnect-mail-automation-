/**
 * BOA daily report page — server load.
 *
 * 1. Verify caller has 'submit' authority (BOA / PROGRAM_OPS / ADMIN).
 * 2. Resolve the caller's assigned ops_os campuses (BOA assignment).
 * 3. Pass campuses + today's date to the page. The page creates / fetches
 *    the actual draft via the API on mount (idempotent create-or-find).
 */
import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { withReadOnlyUserContext } from '@uniconnect/shared';

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) throw redirect(302, '/login');
    const role = locals.user.role as string;
    if (!['ADMIN', 'PROGRAM_OPS', 'BOA'].includes(role)) {
        throw error(403, 'BOA daily report is available to BOA, PROGRAM_OPS, or ADMIN roles only');
    }

    const userId = locals.user.id as string;

    const campuses = await withReadOnlyUserContext(userId, role, async (client) => {
        const r = await client.query<{ campus_id: string; code: string; display_name: string }>(
            `SELECT c.campus_id, c.code, c.display_name
             FROM ops_os.campus_dim c
             JOIN ops_os.user_campus_assignment uca
                  ON uca.campus_id = c.campus_id
                 AND uca.user_id = $1
                 AND uca.role = 'BOA'
                 AND uca.revoked_at IS NULL
             WHERE c.status = 'active'
             ORDER BY c.display_name`,
            [userId],
        );
        // ADMIN/PROGRAM_OPS fallback: if user has no BOA assignment, surface all active campuses
        if (r.rows.length === 0 && (role === 'ADMIN' || role === 'PROGRAM_OPS')) {
            const all = await client.query<{ campus_id: string; code: string; display_name: string }>(
                `SELECT campus_id, code, display_name FROM ops_os.campus_dim
                 WHERE status = 'active'
                 ORDER BY display_name`,
            );
            return all.rows;
        }
        return r.rows;
    });

    const today = new Date().toISOString().slice(0, 10);

    return {
        campuses,
        today,
        role,
    };
};
