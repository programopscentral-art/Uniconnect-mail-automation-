/**
 * Monthly Summary — read-only rollup view.
 *
 * Same shape as the weekly summary, but the period is a calendar month
 * (1st → last day of month). Aggregates the campus's daily submissions
 * for the full month. No submission, no PM review, no save — pure view.
 */
import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
    withReadOnlyUserContext,
    getPeriodRollup,
    lastCompletedMonth,
    monthBoundariesFromIstDate,
    type PeriodRollup,
} from '@uniconnect/shared';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw redirect(302, '/login');
    const role = locals.user.role as string;
    if (!['ADMIN', 'PROGRAM_OPS', 'BOA', 'PMA', 'PM', 'COS'].includes(role)) {
        throw error(403, 'Monthly summary is available to BOA, PMA, PM, COS, PROGRAM_OPS, or ADMIN roles');
    }

    const userId = locals.user.id as string;

    const requestedMonth = url.searchParams.get('month') ?? '';
    const period = DATE_RE.test(requestedMonth)
        ? monthBoundariesFromIstDate(requestedMonth)
        : lastCompletedMonth();

    const campuses = await withReadOnlyUserContext(userId, role, async (client) => {
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

    let rollup: PeriodRollup | null = null;
    if (activeCampusId) {
        rollup = await withReadOnlyUserContext(userId, role, c =>
            getPeriodRollup(
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
