/**
 * Comprehensive monthly report aggregator.
 *
 * The original `getWeeklyRollup` / `getPeriodRollup` only summed metrics
 * stored in `ops_os.submission_value` — i.e. the BOA's daily ops
 * submissions. That left out three categories of data that operators
 * legitimately want in a monthly summary:
 *
 *   1. Faculty attendance — lives in `public.instructor_attendance`,
 *      keyed by university_id + date (NOT in submission_value).
 *   2. Success-coach call activity — lives in
 *      `public.success_coach_daily_log`, keyed by university_id + date.
 *   3. Fee collection snapshots — lives in `public.fee_collection_snapshot`,
 *      keyed by window_id + snapshot_date.
 *
 * This module joins all of the above for the full calendar month so the
 * "monthly summary" actually summarises the month — not just the days
 * that the BOA happened to submit.
 *
 * The aggregator is scoped to a single campus_id; the campus's
 * university_id is resolved internally so callers don't need to pre-look it up.
 */

import type { PoolClient } from 'pg';
import { getWeeklyRollup, type WeeklyRollup } from './weekly';

export interface FacultyAttendanceMonthly {
    days_recorded: number;             // distinct dates with any attendance row this month
    total_instructors: number;         // distinct instructors marked at least once
    present_count: number;             // sum of "present" markings
    absent_authorised_count: number;
    absent_unauthorised_count: number;
    attendance_pct: number | null;     // present / total markings, or null if no rows
    // Per-instructor breakdown for the per-uni XLSX tab (top 50)
    per_instructor: Array<{
        instructor_id: string;
        name: string | null;
        present: number;
        absent_auth: number;
        absent_unauth: number;
        total_days: number;
        attendance_pct: number | null;
    }>;
}

export interface SuccessCoachMonthly {
    days_recorded: number;
    total_coaches: number;
    total_student_calls: number;
    total_parent_calls: number;
    target_aggregate: number;          // sum(daily_target) across all recorded days
    days_target_met: number;           // calls (student+parent) >= daily_target
    days_target_missed: number;
    target_attainment_pct: number | null; // total_calls / target_aggregate
    per_coach: Array<{
        coach_id: string;
        name: string | null;
        student_calls: number;
        parent_calls: number;
        target_sum: number;
        days_recorded: number;
    }>;
}

export interface FeeCollectionMonthly {
    end_of_month_students: number | null;
    end_of_month_fully_paid: number | null;
    end_of_month_partial: number | null;
    end_of_month_yet_to_pay: number | null;
    end_of_month_total_payable: string | null;  // text — bigint values
    end_of_month_total_paid: string | null;
    end_of_month_collection_pct: number | null; // (paid/payable) * 100, rounded
    snapshot_date: string | null;
    snapshots_in_range: number;
}

export interface MonthlyFullRollup {
    period_start: string;
    period_end: string;
    campus_id: string;
    university_id: string | null;
    university_name: string | null;
    ops_rollup: WeeklyRollup;
    faculty: FacultyAttendanceMonthly;
    coach: SuccessCoachMonthly;
    fees: FeeCollectionMonthly;
}

/**
 * Resolve the university_id (+ name) for a campus.
 */
async function resolveCampusUni(
    campus_id: string,
    client: PoolClient,
): Promise<{ university_id: string | null; university_name: string | null }> {
    const r = await client.query<{ university_id: string; name: string }>(
        `SELECT cd.university_id, u.name
           FROM ops_os.campus_dim cd
           LEFT JOIN public.universities u ON u.id = cd.university_id
          WHERE cd.campus_id = $1
          LIMIT 1`,
        [campus_id],
    );
    return {
        university_id: r.rows[0]?.university_id ?? null,
        university_name: r.rows[0]?.name ?? null,
    };
}

async function getFacultyAttendance(
    university_id: string,
    period_start: string,
    period_end: string,
    client: PoolClient,
): Promise<FacultyAttendanceMonthly> {
    const totals = await client.query<{
        days_recorded: string;
        total_instructors: string;
        present_count: string;
        absent_auth: string;
        absent_unauth: string;
    }>(
        `SELECT COUNT(DISTINCT ia.date)::text AS days_recorded,
                COUNT(DISTINCT ia.instructor_id)::text AS total_instructors,
                COUNT(*) FILTER (WHERE ia.status = 'present')::text AS present_count,
                COUNT(*) FILTER (WHERE ia.status = 'absent_authorized')::text AS absent_auth,
                COUNT(*) FILTER (WHERE ia.status = 'absent_unauthorized')::text AS absent_unauth
           FROM public.instructor_attendance ia
          WHERE ia.university_id = $1
            AND ia.date BETWEEN $2::date AND $3::date`,
        [university_id, period_start, period_end],
    );
    const t = totals.rows[0];
    const present = Number(t?.present_count ?? 0);
    const absent_auth = Number(t?.absent_auth ?? 0);
    const absent_unauth = Number(t?.absent_unauth ?? 0);
    const total_markings = present + absent_auth + absent_unauth;

    const perInstructor = await client.query<{
        instructor_id: string;
        name: string | null;
        present: string;
        absent_auth: string;
        absent_unauth: string;
        total_days: string;
    }>(
        `SELECT ia.instructor_id::text,
                COALESCE(ip.name, u.name) AS name,
                COUNT(*) FILTER (WHERE ia.status = 'present')::text AS present,
                COUNT(*) FILTER (WHERE ia.status = 'absent_authorized')::text AS absent_auth,
                COUNT(*) FILTER (WHERE ia.status = 'absent_unauthorized')::text AS absent_unauth,
                COUNT(*)::text AS total_days
           FROM public.instructor_attendance ia
           LEFT JOIN public.instructor_profiles ip ON ip.id = ia.instructor_id
           LEFT JOIN public.users u ON u.id = ip.user_id
          WHERE ia.university_id = $1
            AND ia.date BETWEEN $2::date AND $3::date
          GROUP BY ia.instructor_id, ip.name, u.name
          ORDER BY total_days DESC, name
          LIMIT 200`,
        [university_id, period_start, period_end],
    );

    return {
        days_recorded: Number(t?.days_recorded ?? 0),
        total_instructors: Number(t?.total_instructors ?? 0),
        present_count: present,
        absent_authorised_count: absent_auth,
        absent_unauthorised_count: absent_unauth,
        attendance_pct: total_markings > 0 ? Math.round((present / total_markings) * 100) : null,
        per_instructor: perInstructor.rows.map(r => {
            const p = Number(r.present), aa = Number(r.absent_auth), au = Number(r.absent_unauth);
            const tot = p + aa + au;
            return {
                instructor_id: r.instructor_id,
                name: r.name,
                present: p,
                absent_auth: aa,
                absent_unauth: au,
                total_days: Number(r.total_days),
                attendance_pct: tot > 0 ? Math.round((p / tot) * 100) : null,
            };
        }),
    };
}

async function getSuccessCoachMonthly(
    university_id: string,
    period_start: string,
    period_end: string,
    client: PoolClient,
): Promise<SuccessCoachMonthly> {
    const totals = await client.query<{
        days_recorded: string;
        total_coaches: string;
        total_student_calls: string;
        total_parent_calls: string;
        target_sum: string;
        days_target_met: string;
        days_target_missed: string;
    }>(
        `SELECT COUNT(DISTINCT date)::text AS days_recorded,
                COUNT(DISTINCT coach_id)::text AS total_coaches,
                COALESCE(SUM(student_calls_made), 0)::text AS total_student_calls,
                COALESCE(SUM(parent_calls_made), 0)::text AS total_parent_calls,
                COALESCE(SUM(daily_target), 0)::text AS target_sum,
                COUNT(*) FILTER (WHERE (COALESCE(student_calls_made,0) + COALESCE(parent_calls_made,0)) >= COALESCE(daily_target,0))::text AS days_target_met,
                COUNT(*) FILTER (WHERE (COALESCE(student_calls_made,0) + COALESCE(parent_calls_made,0)) <  COALESCE(daily_target,0))::text AS days_target_missed
           FROM public.success_coach_daily_log
          WHERE university_id = $1
            AND date BETWEEN $2::date AND $3::date`,
        [university_id, period_start, period_end],
    );
    const t = totals.rows[0];
    const studentCalls = Number(t?.total_student_calls ?? 0);
    const parentCalls = Number(t?.total_parent_calls ?? 0);
    const target = Number(t?.target_sum ?? 0);

    const perCoach = await client.query<{
        coach_id: string;
        name: string | null;
        student_calls: string;
        parent_calls: string;
        target_sum: string;
        days_recorded: string;
    }>(
        `SELECT scl.coach_id::text,
                COALESCE(scp.name, u.name) AS name,
                COALESCE(SUM(scl.student_calls_made), 0)::text AS student_calls,
                COALESCE(SUM(scl.parent_calls_made), 0)::text AS parent_calls,
                COALESCE(SUM(scl.daily_target), 0)::text AS target_sum,
                COUNT(*)::text AS days_recorded
           FROM public.success_coach_daily_log scl
           LEFT JOIN public.success_coach_profiles scp ON scp.id = scl.coach_id
           LEFT JOIN public.users u ON u.id = scp.user_id
          WHERE scl.university_id = $1
            AND scl.date BETWEEN $2::date AND $3::date
          GROUP BY scl.coach_id, scp.name, u.name
          ORDER BY (SUM(scl.student_calls_made) + SUM(scl.parent_calls_made)) DESC NULLS LAST
          LIMIT 200`,
        [university_id, period_start, period_end],
    );

    return {
        days_recorded: Number(t?.days_recorded ?? 0),
        total_coaches: Number(t?.total_coaches ?? 0),
        total_student_calls: studentCalls,
        total_parent_calls: parentCalls,
        target_aggregate: target,
        days_target_met: Number(t?.days_target_met ?? 0),
        days_target_missed: Number(t?.days_target_missed ?? 0),
        target_attainment_pct: target > 0 ? Math.round(((studentCalls + parentCalls) / target) * 100) : null,
        per_coach: perCoach.rows.map(r => ({
            coach_id: r.coach_id,
            name: r.name,
            student_calls: Number(r.student_calls),
            parent_calls: Number(r.parent_calls),
            target_sum: Number(r.target_sum),
            days_recorded: Number(r.days_recorded),
        })),
    };
}

async function getFeeCollectionMonthly(
    university_id: string | null,
    period_start: string,
    period_end: string,
    client: PoolClient,
): Promise<FeeCollectionMonthly> {
    // Fee snapshots are window-level, not university-level. We pull the
    // most recent snapshot in the month range. If the table is empty for
    // the window/range, all fields are null.
    if (!university_id) {
        return {
            end_of_month_students: null,
            end_of_month_fully_paid: null,
            end_of_month_partial: null,
            end_of_month_yet_to_pay: null,
            end_of_month_total_payable: null,
            end_of_month_total_paid: null,
            end_of_month_collection_pct: null,
            snapshot_date: null,
            snapshots_in_range: 0,
        };
    }
    const r = await client.query<{
        snapshot_date: string;
        students: string;
        fully_paid: string;
        partial: string;
        yet_to_pay: string;
        total_payable: string;
        total_paid: string;
        collection_pct: string;
        snapshots_in_range: string;
    }>(
        `WITH window_snapshots AS (
            SELECT fcs.*
              FROM fee_collection_snapshot fcs
              JOIN fee_semester_window fsw ON fsw.id = fcs.window_id
              JOIN fee_batch_period bp ON bp.window_id = fsw.id
              JOIN fee_student_payments fsp ON fsp.batch_period_id = bp.id
             WHERE fsp.university_id = $1
               AND fcs.snapshot_date BETWEEN $2::date AND $3::date
             GROUP BY fcs.id
         )
         SELECT snapshot_date::text,
                COALESCE(students, 0)::text AS students,
                COALESCE(fully_paid, 0)::text AS fully_paid,
                COALESCE(partial, 0)::text AS partial,
                COALESCE(yet_to_pay, 0)::text AS yet_to_pay,
                COALESCE(total_payable, 0)::text AS total_payable,
                COALESCE(total_paid, 0)::text AS total_paid,
                COALESCE(collection_pct_x100, 0)::text AS collection_pct,
                (SELECT COUNT(*)::text FROM window_snapshots) AS snapshots_in_range
           FROM window_snapshots
          ORDER BY snapshot_date DESC
          LIMIT 1`,
        [university_id, period_start, period_end],
    ).catch(() => ({ rows: [] as any[] }));

    const row = r.rows[0];
    if (!row) {
        return {
            end_of_month_students: null,
            end_of_month_fully_paid: null,
            end_of_month_partial: null,
            end_of_month_yet_to_pay: null,
            end_of_month_total_payable: null,
            end_of_month_total_paid: null,
            end_of_month_collection_pct: null,
            snapshot_date: null,
            snapshots_in_range: 0,
        };
    }
    return {
        end_of_month_students: Number(row.students),
        end_of_month_fully_paid: Number(row.fully_paid),
        end_of_month_partial: Number(row.partial),
        end_of_month_yet_to_pay: Number(row.yet_to_pay),
        end_of_month_total_payable: row.total_payable,
        end_of_month_total_paid: row.total_paid,
        end_of_month_collection_pct: Number(row.collection_pct) > 0 ? Math.round(Number(row.collection_pct) / 100) : null,
        snapshot_date: row.snapshot_date,
        snapshots_in_range: Number(row.snapshots_in_range),
    };
}

/**
 * Aggregate the full month for a campus, including Ops OS submissions,
 * faculty attendance, success coach activity, and fee collection.
 */
export async function getMonthlyFullRollup(
    params: { campus_id: string; period_start: string; period_end: string },
    client: PoolClient,
): Promise<MonthlyFullRollup> {
    const { campus_id, period_start, period_end } = params;
    const uni = await resolveCampusUni(campus_id, client);

    const [opsRollup, faculty, coach, fees] = await Promise.all([
        getWeeklyRollup({ campus_id, period_start, period_end }, client),
        uni.university_id
            ? getFacultyAttendance(uni.university_id, period_start, period_end, client)
            : Promise.resolve<FacultyAttendanceMonthly>({
                days_recorded: 0, total_instructors: 0, present_count: 0,
                absent_authorised_count: 0, absent_unauthorised_count: 0,
                attendance_pct: null, per_instructor: [],
            }),
        uni.university_id
            ? getSuccessCoachMonthly(uni.university_id, period_start, period_end, client)
            : Promise.resolve<SuccessCoachMonthly>({
                days_recorded: 0, total_coaches: 0, total_student_calls: 0,
                total_parent_calls: 0, target_aggregate: 0, days_target_met: 0,
                days_target_missed: 0, target_attainment_pct: null, per_coach: [],
            }),
        getFeeCollectionMonthly(uni.university_id, period_start, period_end, client),
    ]);

    return {
        period_start, period_end,
        campus_id,
        university_id: uni.university_id,
        university_name: uni.university_name,
        ops_rollup: opsRollup,
        faculty,
        coach,
        fees,
    };
}
