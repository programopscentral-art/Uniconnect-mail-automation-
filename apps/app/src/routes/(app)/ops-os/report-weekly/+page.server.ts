/**
 * BOA Weekly Report — server load.
 *
 * Same pattern as the daily report: auth gate, resolve campuses for the
 * BOA, find-or-create the weekly submission for the requested week, fetch
 * its qualitative values, plus compute the auto-rollup from the campus's
 * daily submissions for that Mon→Sun range.
 *
 * URL params:
 *   ?campus=<uuid>    pick which campus to report on
 *   ?week=YYYY-MM-DD  Monday of the week being summarized
 *                     (defaults to last completed week — see weekly.ts)
 */
import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
    withReadOnlyUserContext,
    withUserContext,
    findCurrentSubmission,
    createSubmission,
    getSubmissionValues,
    getWeeklyRollup,
    lastCompletedWeek,
    weekBoundariesFromIstDate,
    type Submission,
    type WeeklyRollup,
} from '@uniconnect/shared';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw redirect(302, '/login');
    const role = locals.user.role as string;
    if (!['ADMIN', 'PROGRAM_OPS', 'BOA', 'PMA'].includes(role)) {
        throw error(403, 'Weekly report is available to BOA, PMA, PROGRAM_OPS, or ADMIN roles only');
    }

    const userId = locals.user.id as string;

    // Period — default to the most-recently-completed Mon→Sun week.
    const requestedWeek = url.searchParams.get('week') ?? '';
    const period = DATE_RE.test(requestedWeek)
        ? weekBoundariesFromIstDate(requestedWeek)
        : lastCompletedWeek();

    const campuses = await withReadOnlyUserContext(userId, role, async (client) => {
        // Same logic as daily report — explicit assignments first,
        // university-derived fallback, ADMIN/PROGRAM_OPS sees all.
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

    let submission: Submission | null = null;
    let values: Array<{ metric_id: string; value_numeric: number | null; value_text: string | null; value_boolean: boolean | null }> = [];
    let rollup: WeeklyRollup | null = null;

    if (activeCampusId) {
        const draft = await withUserContext(userId, role, async (client) => {
            const existing = await findCurrentSubmission(
                { campus_id: activeCampusId, cadence: 'WEEKLY', period_start: period.period_start, period_end: period.period_end },
                client,
            );
            if (existing) return existing;
            try {
                return await createSubmission(
                    { campus_id: activeCampusId, cadence: 'WEEKLY', period_start: period.period_start, period_end: period.period_end, created_by: userId },
                    client,
                );
            } catch (e) {
                const again = await findCurrentSubmission(
                    { campus_id: activeCampusId, cadence: 'WEEKLY', period_start: period.period_start, period_end: period.period_end },
                    client,
                );
                if (again) return again;
                throw e;
            }
        });
        submission = draft;

        const [rawValues, rollupResult] = await Promise.all([
            withReadOnlyUserContext(userId, role, c => getSubmissionValues(draft.submission_id, c)),
            withReadOnlyUserContext(userId, role, c =>
                getWeeklyRollup(
                    { campus_id: activeCampusId, period_start: period.period_start, period_end: period.period_end },
                    c,
                ),
            ),
        ]);
        values = rawValues.map(v => ({
            metric_id: v.metric_id,
            value_numeric: v.value_numeric,
            value_text: v.value_text,
            value_boolean: v.value_boolean,
        }));
        rollup = rollupResult;
    }

    return {
        campuses,
        period_start: period.period_start,
        period_end: period.period_end,
        role,
        activeCampusId,
        submission,
        values,
        rollup,
    };
};
