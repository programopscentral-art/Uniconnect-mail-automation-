/**
 * PM review queue — server load.
 *
 * Loads the queue rows server-side in one DB roundtrip so the page renders
 * with data already populated — no client "Loading…" flash. Filters live in
 * URL search params (?status=&campus=) so changing them re-runs this load.
 */
import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
    withReadOnlyUserContext,
    listSubmissions,
    type Submission,
    type SubmissionStatus,
} from '@uniconnect/shared';

const AWAITING_STATUSES: SubmissionStatus[] = ['SUBMITTED', 'PM_REVIEW', 'SENT_BACK'];

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw redirect(302, '/login');
    const role = locals.user.role as string;
    if (!['ADMIN', 'PROGRAM_OPS', 'PM', 'PMA', 'COS'].includes(role)) {
        throw error(403, 'PM review is available to PM, PMA, COS, PROGRAM_OPS, or ADMIN roles only');
    }

    const userId = locals.user.id as string;
    const statusFilter = (url.searchParams.get('status') ?? 'awaiting') as 'awaiting' | 'all';
    const campusFilter = url.searchParams.get('campus') ?? '';

    const { campuses, rows } = await withReadOnlyUserContext(userId, role, async (client) => {
        const campusesResult = (role === 'PM' || role === 'PMA')
            ? await client.query<{ campus_id: string; code: string; display_name: string }>(
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
            )
            : await client.query<{ campus_id: string; code: string; display_name: string }>(
                `SELECT campus_id, code, display_name FROM ops_os.campus_dim
                 WHERE status = 'active' ORDER BY display_name`,
            );

        const subs: Submission[] = await listSubmissions(
            {
                statuses: statusFilter === 'awaiting' ? AWAITING_STATUSES : undefined,
                cadence: 'DAILY',
                campus_id: campusFilter || undefined,
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
    };
};
