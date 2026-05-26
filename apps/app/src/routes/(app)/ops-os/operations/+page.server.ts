/**
 * Operations Overview — server load.
 *
 * Loads the overview rows server-side in one DB roundtrip so the table
 * appears with the page render — no client "Loading…" flash. Filters live
 * in URL search params (?date=&campus=&status=&late=&incidents=) so any
 * change re-runs this load.
 */
import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
    withReadOnlyUserContext,
    getDailyOperationsOverview,
    type DailyOpsRow,
    type DailyOpsStatus,
} from '@uniconnect/shared';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_STATUSES: ReadonlyArray<DailyOpsStatus> = [
    'NO_SUBMISSION', 'NEW', 'DRAFT', 'SUBMITTED', 'PM_REVIEW',
    'SENT_BACK', 'SIGNED_OFF', 'LOCKED', 'RETRACTED',
];

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw redirect(302, '/login');
    const role = locals.user.role as string;
    if (!['ADMIN', 'PROGRAM_OPS', 'COS'].includes(role)) {
        throw error(403, 'Operations Overview is for COS, PROGRAM_OPS, or ADMIN roles');
    }
    const userId = locals.user.id as string;

    const today = new Date().toISOString().slice(0, 10);
    const requestedDate = url.searchParams.get('date') ?? '';
    const date = DATE_RE.test(requestedDate) ? requestedDate : today;

    const campusFilter = url.searchParams.get('campus') ?? '';
    const statusRaw = url.searchParams.get('status') ?? '';
    const status: DailyOpsStatus | undefined =
        VALID_STATUSES.includes(statusRaw as DailyOpsStatus) ? (statusRaw as DailyOpsStatus) : undefined;
    const lateOnly = url.searchParams.get('late') === '1';
    const incidentOnly = url.searchParams.get('incidents') === '1';

    const { campuses, rows } = await withReadOnlyUserContext(userId, role, async (client) => {
        const campusesResult = await client.query<{ campus_id: string; code: string; display_name: string }>(
            `SELECT campus_id, code, display_name
             FROM ops_os.campus_dim
             WHERE status = 'active'
             ORDER BY display_name`,
        );
        const overview: DailyOpsRow[] = await getDailyOperationsOverview(
            {
                date,
                campus_ids: campusFilter ? [campusFilter] : undefined,
                status,
                late_only: lateOnly,
                incident_only: incidentOnly,
            },
            client,
        );
        return { campuses: campusesResult.rows, rows: overview };
    });

    return {
        campuses,
        today,
        role,
        rows,
        filters: { date, campus: campusFilter, status: statusRaw, late: lateOnly, incidents: incidentOnly },
    };
};
