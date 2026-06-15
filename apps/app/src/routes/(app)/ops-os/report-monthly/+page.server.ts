/**
 * Monthly Summary — read-only rollup view.
 *
 * Comprehensive month aggregation: pulls Ops OS daily submissions PLUS
 * faculty attendance, success coach calls, and end-of-month fee snapshot
 * for the campus's university. The previous version of this page only
 * summed values inside `ops_os.submission_value`, which is why faculty
 * attendance + coach data appeared missing — those tables live outside
 * the submission spine.
 *
 * Also exposes the campus list AND a per-university list so the user
 * can pick a campus (default) OR (for admin/COS) trigger a per-uni
 * XLSX download via `/api/ops-os/monthly-report.xlsx?university=<uuid>`.
 */
import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
    withReadOnlyUserContext,
    getMonthlyFullRollup,
    lastCompletedMonth,
    monthBoundariesFromIstDate,
    type MonthlyFullRollup,
} from '@uniconnect/shared';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NETWORK_ROLES = new Set(['ADMIN', 'PROGRAM_OPS', 'COS']);

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

    const { campuses, universities } = await withReadOnlyUserContext(userId, role, async (client) => {
        // Campuses the user is assigned to
        const assigned = await client.query<{ campus_id: string; code: string; display_name: string; university_id: string | null; university_name: string | null }>(
            `SELECT c.campus_id, c.code, c.display_name, c.university_id, u.name AS university_name
               FROM ops_os.campus_dim c
               JOIN ops_os.user_campus_assignment uca
                    ON uca.campus_id = c.campus_id
                   AND uca.user_id = $1
                   AND uca.revoked_at IS NULL
               LEFT JOIN public.universities u ON u.id = c.university_id
              WHERE c.status = 'active'
              ORDER BY c.display_name`,
            [userId],
        );

        let campusesRows = assigned.rows;
        // Admin / Program Ops always see every active campus
        if (campusesRows.length === 0 && (role === 'ADMIN' || role === 'PROGRAM_OPS')) {
            const all = await client.query<{ campus_id: string; code: string; display_name: string; university_id: string | null; university_name: string | null }>(
                `SELECT c.campus_id, c.code, c.display_name, c.university_id, u.name AS university_name
                   FROM ops_os.campus_dim c
                   LEFT JOIN public.universities u ON u.id = c.university_id
                  WHERE c.status = 'active' ORDER BY c.display_name`,
            );
            campusesRows = all.rows;
        }

        // Universities the user can pull "all-campuses-of-this-uni" reports for.
        // Network roles (ADMIN/PROGRAM_OPS/COS) get every uni; others get only
        // the unis whose campuses appear in their campus assignments.
        let universitiesRows: Array<{ id: string; name: string }> = [];
        if (NETWORK_ROLES.has(role) || role === 'PROGRAM_OPS') {
            const u = await client.query<{ id: string; name: string }>(
                `SELECT id::text, name FROM public.universities
                  WHERE COALESCE(is_team, false) = false
                  ORDER BY name`,
            );
            universitiesRows = u.rows;
        } else {
            const seenUniIds = new Set(campusesRows.map(c => c.university_id).filter((x): x is string => !!x));
            universitiesRows = campusesRows
                .filter(c => c.university_id && seenUniIds.has(c.university_id))
                .map(c => ({ id: c.university_id!, name: c.university_name ?? '(uni)' }))
                .filter((u, i, arr) => arr.findIndex(x => x.id === u.id) === i);
        }

        return { campuses: campusesRows, universities: universitiesRows };
    });

    const requestedCampus = url.searchParams.get('campus') ?? '';
    const activeCampusId = campuses.find(c => c.campus_id === requestedCampus)?.campus_id
        ?? campuses[0]?.campus_id
        ?? '';

    let rollup: MonthlyFullRollup | null = null;
    if (activeCampusId) {
        rollup = await withReadOnlyUserContext(userId, role, c =>
            getMonthlyFullRollup(
                { campus_id: activeCampusId, period_start: period.period_start, period_end: period.period_end },
                c,
            ),
        );
    }

    return {
        campuses,
        universities,
        period_start: period.period_start,
        period_end: period.period_end,
        role,
        canDownloadUniWide: NETWORK_ROLES.has(role) || role === 'PROGRAM_OPS',
        activeCampusId,
        rollup,
    };
};
