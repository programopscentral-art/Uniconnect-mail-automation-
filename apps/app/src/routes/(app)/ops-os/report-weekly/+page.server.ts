/**
 * Weekly Summary — read-only rollup view.
 *
 * Weekly is purely a calculation across the campus's 7 daily submissions
 * for a Mon→Sun period. No separate submission, no PM review, no save —
 * the page just renders the rollup. Reached by clicking "View weekly
 * summary" on the Daily Report page (or by navigating to the URL with
 * ?campus and ?week params).
 */
import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
    withReadOnlyUserContext,
    getWeeklyRollup,
    lastCompletedWeek,
    weekBoundariesFromIstDate,
    type WeeklyRollup,
} from '@uniconnect/shared';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw redirect(302, '/login');
    const role = locals.user.role as string;
    if (!['ADMIN', 'PROGRAM_OPS', 'BOA', 'PMA', 'PM', 'COS'].includes(role)) {
        throw error(403, 'Weekly summary is available to BOA, PMA, PM, COS, PROGRAM_OPS, or ADMIN roles');
    }

    const userId = locals.user.id as string;

    const requestedWeek = url.searchParams.get('week') ?? '';
    const period = DATE_RE.test(requestedWeek)
        ? weekBoundariesFromIstDate(requestedWeek)
        : lastCompletedWeek();

    const campuses = await withReadOnlyUserContext(userId, role, async (client) => {
        // Same campus-resolution as the daily report — explicit assignment
        // (BOA or PM), then ADMIN/PROGRAM_OPS fallback to all, then
        // university-derived fallback.
        const r = await client.query<{ campus_id: string; code: string; display_name: string }>(
            `SELECT c.campus_id, c.code, c.display_name
             FROM ops_os.campus_dim c
             JOIN ops_os.user_campus_assignment uca
                  ON uca.campus_id = c.campus_id
                 AND uca.user_id = $1
                 AND uca.revoked_at IS NULL
             WHERE c.status = 'active'
             ORDER BY c.display_name`,
            [userId],
        );
        if (r.rows.length > 0) return r.rows;

        if (role === 'ADMIN' || role === 'PROGRAM_OPS') {
            const all = await client.query<{ campus_id: string; code: string; display_name: string }>(
                `SELECT campus_id, code, display_name FROM ops_os.campus_dim
                 WHERE status = 'active' ORDER BY display_name`,
            );
            return all.rows;
        }

        const fallback = await client.query<{ campus_id: string; code: string; display_name: string }>(
            `SELECT DISTINCT cd.campus_id, cd.code, cd.display_name
               FROM ops_os.campus_dim cd
               LEFT JOIN public.users u ON u.id = $1
               LEFT JOIN public.user_universities uu ON uu.user_id = $1
              WHERE cd.status = 'active'
                AND (cd.university_id = u.university_id OR cd.university_id = uu.university_id)
              ORDER BY cd.display_name`,
            [userId],
        );
        return fallback.rows;
    });

    const requestedCampus = url.searchParams.get('campus') ?? '';
    const activeCampusId = campuses.find(c => c.campus_id === requestedCampus)?.campus_id
        ?? campuses[0]?.campus_id
        ?? '';

    let rollup: WeeklyRollup | null = null;
    if (activeCampusId) {
        rollup = await withReadOnlyUserContext(userId, role, c =>
            getWeeklyRollup(
                { campus_id: activeCampusId, period_start: period.period_start, period_end: period.period_end },
                c,
            ),
        );
    }

    return {
        campuses,
        period_start: period.period_start,
        period_end: period.period_end,
        role,
        activeCampusId,
        rollup,
    };
};
