/**
 * Operations Overview — server load.
 *
 * Supports three cadences via ?cadence=daily|weekly|monthly. Daily uses
 * the existing getDailyOperationsOverview (per-campus per-day row, with
 * sub/sign-off times etc.). Weekly + Monthly use getCampusPeriodOverview
 * to aggregate the campus's daily submissions across the chosen period
 * into one row per campus.
 *
 * Filters live in URL search params so any change re-runs this load
 * (?cadence=&date=&campus=&status=&late=&incidents=).
 */
import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
    withReadOnlyUserContext,
    getDailyOperationsOverview,
    getCampusPeriodOverview,
    lastCompletedWeek,
    weekBoundariesFromIstDate,
    lastCompletedMonth,
    monthBoundariesFromIstDate,
    type DailyOpsRow,
    type DailyOpsStatus,
    type CampusPeriodOverviewRow,
} from '@uniconnect/shared';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_STATUSES: ReadonlyArray<DailyOpsStatus> = [
    'NO_SUBMISSION', 'NEW', 'DRAFT', 'SUBMITTED', 'PM_REVIEW',
    'SENT_BACK', 'SIGNED_OFF', 'LOCKED', 'RETRACTED',
];

export type Cadence = 'daily' | 'weekly' | 'monthly';

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw redirect(302, '/login');
    const role = locals.user.role as string;
    if (!['ADMIN', 'PROGRAM_OPS', 'COS'].includes(role)) {
        throw error(403, 'Operations Overview is for COS, PROGRAM_OPS, or ADMIN roles');
    }
    const userId = locals.user.id as string;

    const rawCadence = url.searchParams.get('cadence') ?? 'daily';
    const cadence: Cadence =
        rawCadence === 'weekly' || rawCadence === 'monthly' ? rawCadence : 'daily';

    const today = new Date().toISOString().slice(0, 10);
    const requestedDate = url.searchParams.get('date') ?? '';
    const date = DATE_RE.test(requestedDate) ? requestedDate : today;

    const campusFilter = url.searchParams.get('campus') ?? '';
    const statusRaw = url.searchParams.get('status') ?? '';
    const status: DailyOpsStatus | undefined =
        VALID_STATUSES.includes(statusRaw as DailyOpsStatus) ? (statusRaw as DailyOpsStatus) : undefined;
    const lateOnly = url.searchParams.get('late') === '1';
    const incidentOnly = url.searchParams.get('incidents') === '1';

    // Resolve period for weekly / monthly views
    let weekStart = '';
    let monthStart = '';
    let periodStart = '';
    let periodEnd = '';
    if (cadence === 'weekly') {
        const requestedWeek = url.searchParams.get('week') ?? '';
        const p = DATE_RE.test(requestedWeek)
            ? weekBoundariesFromIstDate(requestedWeek)
            : lastCompletedWeek();
        weekStart = p.period_start;
        periodStart = p.period_start;
        periodEnd = p.period_end;
    } else if (cadence === 'monthly') {
        const requestedMonth = url.searchParams.get('month') ?? '';
        const p = DATE_RE.test(requestedMonth)
            ? monthBoundariesFromIstDate(requestedMonth)
            : lastCompletedMonth();
        monthStart = p.period_start;
        periodStart = p.period_start;
        periodEnd = p.period_end;
    }

    const result = await withReadOnlyUserContext(userId, role, async (client) => {
        const campusesResult = await client.query<{ campus_id: string; code: string; display_name: string }>(
            `SELECT campus_id, code, display_name
             FROM ops_os.campus_dim
             WHERE status = 'active'
             ORDER BY display_name`,
        );

        if (cadence === 'daily') {
            const rows: DailyOpsRow[] = await getDailyOperationsOverview(
                {
                    date,
                    campus_ids: campusFilter ? [campusFilter] : undefined,
                    status,
                    late_only: lateOnly,
                    incident_only: incidentOnly,
                },
                client,
            );
            return { campuses: campusesResult.rows, dailyRows: rows, periodRows: null as null };
        }

        const periodRows: CampusPeriodOverviewRow[] = await getCampusPeriodOverview(
            {
                period_start: periodStart,
                period_end: periodEnd,
                campus_ids: campusFilter ? [campusFilter] : undefined,
            },
            client,
        );
        return { campuses: campusesResult.rows, dailyRows: null as null, periodRows };
    });

    return {
        campuses: result.campuses,
        today,
        role,
        cadence,
        dailyRows: result.dailyRows,
        periodRows: result.periodRows,
        weekStart,
        monthStart,
        periodStart,
        periodEnd,
        filters: { date, campus: campusFilter, status: statusRaw, late: lateOnly, incidents: incidentOnly },
    };
};
