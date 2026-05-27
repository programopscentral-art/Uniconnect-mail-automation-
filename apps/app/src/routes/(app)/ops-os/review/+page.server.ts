/**
 * PM review queue — server load.
 *
 * Loads the queue rows server-side in one DB roundtrip so the page renders
 * with data already populated — no client "Loading…" flash. Filters live in
 * URL search params (?status=&campus=&date=) so changing them re-runs this load.
 *
 * Date filter defaults to today (IST). Without this default, every campus
 * with a draft on multiple days appears as N rows in the queue — confusing
 * the PM into thinking the same campus is duplicated. With the default, the
 * PM sees one row per campus per day, and can change the date dropdown to
 * "Last 7 days" or "All" to widen the view.
 */
import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
    withReadOnlyUserContext,
    listSubmissions,
    todayInIst,
    type Submission,
    type SubmissionStatus,
} from '@uniconnect/shared';

const AWAITING_STATUSES: SubmissionStatus[] = ['SUBMITTED', 'PM_REVIEW', 'SENT_BACK'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type DateScope = 'today' | 'week' | 'all' | 'custom';

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw redirect(302, '/login');
    const role = locals.user.role as string;
    if (!['ADMIN', 'PROGRAM_OPS', 'PM', 'PMA', 'COS'].includes(role)) {
        throw error(403, 'PM review is available to PM, PMA, COS, PROGRAM_OPS, or ADMIN roles only');
    }

    const userId = locals.user.id as string;
    const statusFilter = (url.searchParams.get('status') ?? 'awaiting') as 'awaiting' | 'all';
    const campusFilter = url.searchParams.get('campus') ?? '';

    // Date scope: today / week / all / custom. Default "today".
    const rawScope = url.searchParams.get('scope') ?? '';
    const rawDate = url.searchParams.get('date') ?? '';
    const dateScope: DateScope = ['today', 'week', 'all', 'custom'].includes(rawScope)
        ? (rawScope as DateScope)
        : (rawDate && DATE_RE.test(rawDate) ? 'custom' : 'today');
    const customDate = DATE_RE.test(rawDate) ? rawDate : '';

    const today = todayInIst();
    let periodFrom: string | undefined;
    let periodTo: string | undefined;
    if (dateScope === 'today') {
        periodFrom = today; periodTo = today;
    } else if (dateScope === 'week') {
        const d = new Date(today + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() - 6);
        periodFrom = d.toISOString().slice(0, 10);
        periodTo = today;
    } else if (dateScope === 'custom' && customDate) {
        periodFrom = customDate; periodTo = customDate;
    } else {
        // 'all' — no period bounds
        periodFrom = undefined; periodTo = undefined;
    }

    const { campuses, rows } = await withReadOnlyUserContext(userId, role, async (client) => {
        let campusesResult;
        if (role === 'PM' || role === 'PMA') {
            // 1. Explicit assignments first (PM role on assignment table —
            //    PMA users get a PM-role row via auto_assign).
            campusesResult = await client.query<{ campus_id: string; code: string; display_name: string }>(
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
            // 2. Fallback to university-derived campuses if no assignment yet
            if (campusesResult.rowCount === 0) {
                campusesResult = await client.query<{ campus_id: string; code: string; display_name: string }>(
                    `SELECT DISTINCT cd.campus_id, cd.code, cd.display_name
                       FROM ops_os.campus_dim cd
                       LEFT JOIN public.users u ON u.id = $1
                       LEFT JOIN public.user_universities uu ON uu.user_id = $1
                      WHERE cd.status = 'active'
                        AND (cd.university_id = u.university_id OR cd.university_id = uu.university_id)
                      ORDER BY cd.display_name`,
                    [userId],
                );
            }
        } else {
            campusesResult = await client.query<{ campus_id: string; code: string; display_name: string }>(
                `SELECT campus_id, code, display_name FROM ops_os.campus_dim
                 WHERE status = 'active' ORDER BY display_name`,
            );
        }

        const subs: Submission[] = await listSubmissions(
            {
                statuses: statusFilter === 'awaiting' ? AWAITING_STATUSES : undefined,
                cadence: 'DAILY',
                campus_id: campusFilter || undefined,
                period_start_from: periodFrom,
                period_start_to: periodTo,
                limit: 100,
            },
            client,
        );

        return { campuses: campusesResult.rows, rows: subs };
    });

    return {
        campuses,
        role,
        rows,
        statusFilter,
        campusFilter,
        dateScope,
        customDate,
        today,
    };
};
