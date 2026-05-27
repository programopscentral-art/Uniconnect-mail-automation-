/**
 * Operations OS — weekly cadence helpers.
 *
 * Weekly reports use the same submission table + lifecycle as daily, but:
 *   - period_start = Monday (IST) of the reported week
 *   - period_end   = Sunday (IST) of the same week
 *   - cadence      = 'WEEKLY'
 *
 * The quantitative portion of a weekly report (sessions, attendance,
 * incidents, sent-backs, etc.) is NOT stored as separate weekly
 * submission_values. Instead it's derived on the fly by `getWeeklyRollup`
 * from the 7 daily submissions for that campus + period. DAILY remains
 * the single source of truth and weekly stays a view on top.
 *
 * The qualitative portion (summary, concerns, next_week_priorities,
 * team_morale, etc.) IS stored as submission_values under the WEEKLY
 * submission_id. These are the metrics seeded in migration 0096.
 */

import type { PoolClient } from 'pg';

// ── Period math ──────────────────────────────────────────────────────────

/** Today's date in IST as YYYY-MM-DD. */
function todayIstYmd(now: Date = new Date()): string {
    const istMs = now.getTime() + (5 * 60 + 30) * 60 * 1000;
    return new Date(istMs).toISOString().slice(0, 10);
}

/** Parse a YYYY-MM-DD string as a UTC date (no time component). */
function parseYmd(s: string): Date {
    return new Date(s + 'T00:00:00Z');
}

function formatYmd(d: Date): string {
    return d.toISOString().slice(0, 10);
}

/**
 * Given an IST calendar date, return the Monday→Sunday week boundaries that
 * contain it.
 *
 * Monday's getUTCDay() is 1. Sunday is 0. To get back to the Monday for any
 * day we subtract `(day === 0 ? 6 : day - 1)` UTC days from the input date —
 * since we treated the input as a UTC date this stays calendar-correct.
 */
export function weekBoundariesFromIstDate(ymd: string): { period_start: string; period_end: string } {
    const d = parseYmd(ymd);
    const day = d.getUTCDay();
    const daysSinceMonday = day === 0 ? 6 : day - 1;
    const mon = new Date(d.getTime() - daysSinceMonday * 86400_000);
    const sun = new Date(mon.getTime() + 6 * 86400_000);
    return { period_start: formatYmd(mon), period_end: formatYmd(sun) };
}

/**
 * Return the most recently *completed* Mon→Sun week in IST. Used as the
 * default period when a BOA opens the weekly report — the week being
 * summarized is always the one that just ended, never the current one.
 */
export function lastCompletedWeek(now: Date = new Date()): { period_start: string; period_end: string } {
    const today = todayIstYmd(now);
    const thisWeek = weekBoundariesFromIstDate(today);
    // If today is Monday (day=1 in UTC-shifted IST), thisWeek's Monday is
    // today and the "completed" week is the previous one.
    const d = parseYmd(today);
    const day = d.getUTCDay(); // 0..6 — 0=Sun, 1=Mon
    if (day === 1) {
        // shift one week back
        const monPrev = parseYmd(thisWeek.period_start);
        monPrev.setUTCDate(monPrev.getUTCDate() - 7);
        const sunPrev = new Date(monPrev.getTime() + 6 * 86400_000);
        return { period_start: formatYmd(monPrev), period_end: formatYmd(sunPrev) };
    }
    // Tuesday-Sunday: thisWeek.period_start is the active Monday, but the
    // user is summarizing the week-to-date or the previous completed week.
    // Convention: default to the most-recently-completed week, i.e. the
    // Mon→Sun whose Sunday is in the past or today.
    const sunThisWeek = parseYmd(thisWeek.period_end);
    if (sunThisWeek.getTime() <= d.getTime()) {
        // The Sunday of this week has already passed (i.e., today is Sun).
        return thisWeek;
    }
    // Today is mid-week — last completed week is the previous one.
    const monPrev = parseYmd(thisWeek.period_start);
    monPrev.setUTCDate(monPrev.getUTCDate() - 7);
    const sunPrev = new Date(monPrev.getTime() + 6 * 86400_000);
    return { period_start: formatYmd(monPrev), period_end: formatYmd(sunPrev) };
}

// ── Weekly auto-rollup ───────────────────────────────────────────────────

export interface WeeklyRollup {
    period_start: string;
    period_end: string;
    days_in_range: number;
    days_submitted: number;
    days_signed_off: number;
    days_holiday: number;
    days_auto_signed_off: number;
    days_late_submission: number;
    days_no_submission: number;
    sent_backs_count: number;

    // Sums across the week (NULL-safe).
    total_sessions_held: number;
    total_sessions_scheduled: number;
    total_students_present: number;
    total_students_enrolled: number;
    total_faculty_absent: number;
    total_incidents_flagged: number;
    total_hostel_issues: number;
    total_transport_incidents: number;
    total_escalations_opened: number;
    total_escalations_closed: number;

    // Derived percentages — null when denominator is zero.
    avg_attendance_pct: number | null;
    sessions_held_pct: number | null;
}

const NUMERIC_METRICS = [
    'daily.academic.sessions_conducted',
    'daily.academic.sessions_scheduled',
    'daily.attendance.present',
    'daily.attendance.total_enrolled',
    'daily.faculty.absent_count',
    'daily.incidents.count',
    'daily.student_ops.hostel_issues_count',
    'daily.student_ops.transport_incidents_count',
    'daily.student_ops.escalations_opened',
    'daily.student_ops.escalations_closed',
] as const;

/**
 * Aggregate the 7 daily submissions for (campus, week) into a single rollup.
 * Daily submissions with status NEW/DRAFT are excluded — only SUBMITTED+
 * count toward the totals. Holiday days contribute 0 to numeric sums but
 * are counted in `days_holiday`.
 */
export async function getWeeklyRollup(
    params: { campus_id: string; period_start: string; period_end: string },
    client: PoolClient,
): Promise<WeeklyRollup> {
    const { campus_id, period_start, period_end } = params;

    // Per-day status + holiday + late flags
    const dailyStatus = await client.query<{
        period_start: string;
        status: string;
        auto_signed_off: boolean;
        is_late_submission: boolean;
        sent_back_count: number;
        is_holiday: boolean;
    }>(
        `SELECT s.period_start::text AS period_start,
                s.status,
                COALESCE(s.auto_signed_off, false) AS auto_signed_off,
                COALESCE(s.is_late_submission, false) AS is_late_submission,
                COALESCE(s.sent_back_count, 0) AS sent_back_count,
                COALESCE(
                    (SELECT value_boolean FROM ops_os.submission_value
                      WHERE submission_id = s.submission_id
                        AND metric_id = 'daily.day_type.is_holiday'),
                    false
                ) AS is_holiday
           FROM ops_os.submission s
          WHERE s.campus_id = $1
            AND s.cadence = 'DAILY'
            AND s.period_start BETWEEN $2::date AND $3::date
            AND s.supersedes IS NULL`,
        [campus_id, period_start, period_end],
    );

    // Numeric sums by metric_id, only from non-holiday submitted+ days
    const numericSums = await client.query<{ metric_id: string; total: string | null }>(
        `SELECT sv.metric_id, SUM(sv.value_numeric)::text AS total
           FROM ops_os.submission s
           JOIN ops_os.submission_value sv ON sv.submission_id = s.submission_id
          WHERE s.campus_id = $1
            AND s.cadence = 'DAILY'
            AND s.period_start BETWEEN $2::date AND $3::date
            AND s.supersedes IS NULL
            AND s.status IN ('SUBMITTED', 'PM_REVIEW', 'SIGNED_OFF', 'LOCKED', 'SENT_BACK')
            AND sv.metric_id = ANY($4::text[])
          GROUP BY sv.metric_id`,
        [campus_id, period_start, period_end, NUMERIC_METRICS as unknown as string[]],
    );
    const sums = new Map<string, number>();
    for (const r of numericSums.rows) {
        sums.set(r.metric_id, r.total ? Number(r.total) : 0);
    }
    const num = (k: string) => sums.get(k) ?? 0;

    // Day counters
    const days_in_range = Math.round(
        (parseYmd(period_end).getTime() - parseYmd(period_start).getTime()) / 86400_000,
    ) + 1;

    const submittedStatuses = new Set(['SUBMITTED', 'PM_REVIEW', 'SIGNED_OFF', 'LOCKED', 'SENT_BACK']);
    let days_submitted = 0, days_signed_off = 0, days_holiday = 0;
    let days_auto_signed_off = 0, days_late_submission = 0, sent_backs_count = 0;
    for (const r of dailyStatus.rows) {
        if (submittedStatuses.has(r.status)) days_submitted++;
        if (r.status === 'SIGNED_OFF' || r.status === 'LOCKED') days_signed_off++;
        if (r.is_holiday) days_holiday++;
        if (r.auto_signed_off) days_auto_signed_off++;
        if (r.is_late_submission) days_late_submission++;
        sent_backs_count += r.sent_back_count;
    }
    const days_no_submission = Math.max(0, days_in_range - dailyStatus.rowCount!);

    const total_sessions_held      = num('daily.academic.sessions_conducted');
    const total_sessions_scheduled = num('daily.academic.sessions_scheduled');
    const total_students_present   = num('daily.attendance.present');
    const total_students_enrolled  = num('daily.attendance.total_enrolled');

    const avg_attendance_pct = total_students_enrolled > 0
        ? Math.round((total_students_present / total_students_enrolled) * 100)
        : null;
    const sessions_held_pct = total_sessions_scheduled > 0
        ? Math.round((total_sessions_held / total_sessions_scheduled) * 100)
        : null;

    return {
        period_start,
        period_end,
        days_in_range,
        days_submitted,
        days_signed_off,
        days_holiday,
        days_auto_signed_off,
        days_late_submission,
        days_no_submission,
        sent_backs_count,
        total_sessions_held,
        total_sessions_scheduled,
        total_students_present,
        total_students_enrolled,
        total_faculty_absent: num('daily.faculty.absent_count'),
        total_incidents_flagged: num('daily.incidents.count'),
        total_hostel_issues: num('daily.student_ops.hostel_issues_count'),
        total_transport_incidents: num('daily.student_ops.transport_incidents_count'),
        total_escalations_opened: num('daily.student_ops.escalations_opened'),
        total_escalations_closed: num('daily.student_ops.escalations_closed'),
        avg_attendance_pct,
        sessions_held_pct,
    };
}
