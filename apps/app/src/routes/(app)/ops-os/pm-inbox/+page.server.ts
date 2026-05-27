/**
 * PM Inbox — landing page for PMs that surfaces "what needs your attention
 * right now" across the campuses you cover.
 *
 * For PM/PMA: scoped to their campus assignments.
 * For COS: scoped to the cluster's campuses.
 * For ADMIN/PROGRAM_OPS: global view of every PM-assigned campus.
 *
 * Everything is read-only — the page is a curated index into the existing
 * PM Review workflow. Each list item links straight into /ops-os/review/[id]
 * so the PM can act in one click.
 */
import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { withReadOnlyUserContext, todayInIst } from '@uniconnect/shared';

interface CampusBrief { campus_id: string; code: string; display_name: string; }
interface WaitingItem {
    submission_id: string;
    campus_id: string;
    campus_name: string;
    campus_code: string;
    period_start: string;
    status: string;
    submitted_at: string | null;
    waiting_minutes: number;
}
interface SentBackItem {
    submission_id: string;
    campus_id: string;
    campus_name: string;
    period_start: string;
    sent_back_reason_code: string | null;
    sent_back_count: number;
    waiting_minutes: number;
}
interface MissingItem {
    campus_id: string;
    campus_name: string;
    campus_code: string;
    status: 'NO_SUBMISSION' | 'DRAFT' | 'NEW';
}

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) throw redirect(302, '/login');
    const role = locals.user.role as string;
    if (!['ADMIN', 'PROGRAM_OPS', 'PM', 'PMA', 'COS'].includes(role)) {
        throw error(403, 'PM Inbox is for PM, PMA, COS, PROGRAM_OPS, or ADMIN roles');
    }
    const userId = locals.user.id as string;
    const today = todayInIst();
    // ── Period bounds ───────────────────────────────────────────────
    // This week (Mon-today) for avg review time
    // This month-to-date for non-response count
    const todayDate = new Date(today + 'T00:00:00Z');
    const day = todayDate.getUTCDay(); // 0=Sun, 1=Mon
    const daysSinceMonday = day === 0 ? 6 : day - 1;
    const weekStart = new Date(todayDate.getTime() - daysSinceMonday * 86400_000);
    const weekStartYmd = weekStart.toISOString().slice(0, 10);
    const monthStart = new Date(Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth(), 1));
    const monthStartYmd = monthStart.toISOString().slice(0, 10);

    const data = await withReadOnlyUserContext(userId, role, async (client) => {
        // ── Scoped campuses for this user ─────────────────────────────
        let campuses: CampusBrief[];
        if (role === 'ADMIN' || role === 'PROGRAM_OPS') {
            const r = await client.query<CampusBrief>(
                `SELECT campus_id, code, display_name FROM ops_os.campus_dim
                  WHERE status = 'active' ORDER BY display_name`,
            );
            campuses = r.rows;
        } else if (role === 'COS') {
            const r = await client.query<CampusBrief>(
                `SELECT cd.campus_id, cd.code, cd.display_name
                   FROM ops_os.campus_dim cd
                   JOIN ops_os.cluster_dim cl ON cl.cluster_id = cd.cluster_id
                  WHERE cd.status = 'active'
                    AND cl.cos_user_id = $1
                  ORDER BY cd.display_name`,
                [userId],
            );
            campuses = r.rows;
        } else {
            // PM / PMA: explicit assignments
            const r = await client.query<CampusBrief>(
                `SELECT DISTINCT cd.campus_id, cd.code, cd.display_name
                   FROM ops_os.user_campus_assignment uca
                   JOIN ops_os.campus_dim cd ON cd.campus_id = uca.campus_id
                  WHERE uca.user_id = $1
                    AND uca.role = 'PM'
                    AND uca.revoked_at IS NULL
                    AND cd.status = 'active'
                  ORDER BY cd.display_name`,
                [userId],
            );
            campuses = r.rows;
        }
        const campusIds = campuses.map(c => c.campus_id);
        if (campusIds.length === 0) {
            return {
                campuses, waiting: [] as WaitingItem[], sentBack: [] as SentBackItem[], missingToday: [] as MissingItem[],
                avgReviewMinutes: null as number | null,
                nonResponseCount: 0,
                signedOffByYouThisWeek: 0,
                remindersToYouToday: 0,
            };
        }

        // ── Awaiting decision (SUBMITTED / PM_REVIEW) for today's date ─
        const waitingRes = await client.query<{
            submission_id: string; campus_id: string; period_start: string;
            status: string; submitted_at: string | null;
            campus_name: string; campus_code: string;
        }>(
            `SELECT s.submission_id, s.campus_id, s.period_start::text AS period_start,
                    s.status, s.submitted_at::text AS submitted_at,
                    cd.display_name AS campus_name, cd.code AS campus_code
               FROM ops_os.submission s
               JOIN ops_os.campus_dim cd ON cd.campus_id = s.campus_id
              WHERE s.campus_id = ANY($1::uuid[])
                AND s.cadence = 'DAILY'
                AND s.status IN ('SUBMITTED', 'PM_REVIEW')
                AND s.supersedes IS NULL
              ORDER BY s.submitted_at ASC NULLS LAST
              LIMIT 50`,
            [campusIds],
        );
        const now = Date.now();
        const waiting: WaitingItem[] = waitingRes.rows.map(r => ({
            submission_id: r.submission_id,
            campus_id: r.campus_id,
            campus_name: r.campus_name,
            campus_code: r.campus_code,
            period_start: r.period_start,
            status: r.status,
            submitted_at: r.submitted_at,
            waiting_minutes: r.submitted_at ? Math.round((now - new Date(r.submitted_at).getTime()) / 60_000) : 0,
        }));

        // ── Sent back, waiting on BOA to re-submit ────────────────────
        const sentBackRes = await client.query<{
            submission_id: string; campus_id: string; period_start: string;
            sent_back_reason_code: string | null; sent_back_count: number;
            campus_name: string; updated_at: string;
        }>(
            `SELECT s.submission_id, s.campus_id, s.period_start::text AS period_start,
                    s.sent_back_reason_code, s.sent_back_count,
                    cd.display_name AS campus_name, s.updated_at::text AS updated_at
               FROM ops_os.submission s
               JOIN ops_os.campus_dim cd ON cd.campus_id = s.campus_id
              WHERE s.campus_id = ANY($1::uuid[])
                AND s.cadence = 'DAILY'
                AND s.status = 'SENT_BACK'
                AND s.supersedes IS NULL
              ORDER BY s.updated_at DESC
              LIMIT 50`,
            [campusIds],
        );
        const sentBack: SentBackItem[] = sentBackRes.rows.map(r => ({
            submission_id: r.submission_id,
            campus_id: r.campus_id,
            campus_name: r.campus_name,
            period_start: r.period_start,
            sent_back_reason_code: r.sent_back_reason_code,
            sent_back_count: r.sent_back_count,
            waiting_minutes: Math.round((now - new Date(r.updated_at).getTime()) / 60_000),
        }));

        // ── Campuses missing today (no submission OR still DRAFT/NEW) ─
        const missingRes = await client.query<{ campus_id: string; campus_name: string; campus_code: string; status: string | null }>(
            `SELECT cd.campus_id, cd.display_name AS campus_name, cd.code AS campus_code,
                    s.status
               FROM ops_os.campus_dim cd
               LEFT JOIN ops_os.submission s
                  ON s.campus_id = cd.campus_id
                 AND s.cadence = 'DAILY'
                 AND s.period_start = $2::date
                 AND s.supersedes IS NULL
              WHERE cd.campus_id = ANY($1::uuid[])
                AND cd.status = 'active'
                AND (s.status IS NULL OR s.status IN ('NEW', 'DRAFT'))
              ORDER BY cd.display_name`,
            [campusIds, today],
        );
        const missingToday: MissingItem[] = missingRes.rows.map(r => ({
            campus_id: r.campus_id,
            campus_name: r.campus_name,
            campus_code: r.campus_code,
            status: (r.status ?? 'NO_SUBMISSION') as 'NO_SUBMISSION' | 'DRAFT' | 'NEW',
        }));

        // ── Avg review time (submit → first PM action) this week ──────
        // Uses event_log: pair submission.submitted with submission.sent_back / signed_off,
        // taking the earliest PM action per submission.
        let avgReviewMinutes: number | null = null;
        if (role !== 'ADMIN' && role !== 'PROGRAM_OPS') {
            const reviewRes = await client.query<{ avg_min: string | null }>(
                `WITH submits AS (
                    SELECT aggregate_id AS submission_id, MIN(recorded_at) AS submitted_at
                      FROM ops_os.event_log
                     WHERE event_type = 'submission.submitted'
                       AND recorded_at >= $2::date
                     GROUP BY aggregate_id
                 ),
                 actions AS (
                    SELECT e.aggregate_id AS submission_id, MIN(e.recorded_at) AS acted_at
                      FROM ops_os.event_log e
                      JOIN ops_os.submission s ON s.submission_id = e.aggregate_id
                     WHERE e.event_type IN ('submission.signed_off', 'submission.sent_back')
                       AND e.actor_user_id = $1
                       AND e.recorded_at >= $2::date
                       AND s.campus_id = ANY($3::uuid[])
                     GROUP BY e.aggregate_id
                 )
                 SELECT AVG(EXTRACT(EPOCH FROM (a.acted_at - su.submitted_at)) / 60)::text AS avg_min
                   FROM submits su
                   JOIN actions a USING (submission_id)
                  WHERE a.acted_at > su.submitted_at`,
                [userId, weekStartYmd, campusIds],
            );
            const raw = reviewRes.rows[0]?.avg_min;
            avgReviewMinutes = raw ? Math.round(Number(raw)) : null;
        }

        // ── Non-response count this month for this user's assignments ─
        let nonResponseCount = 0;
        if (role === 'PM' || role === 'PMA') {
            const nrRes = await client.query<{ total: string }>(
                `SELECT COALESCE(SUM(non_response_count), 0)::text AS total
                   FROM ops_os.user_campus_assignment
                  WHERE user_id = $1
                    AND role = 'PM'
                    AND revoked_at IS NULL
                    AND (last_non_response_at IS NULL OR last_non_response_at >= $2::date)`,
                [userId, monthStartYmd],
            );
            nonResponseCount = parseInt(nrRes.rows[0]?.total ?? '0', 10);
        }

        // ── Signed off by you this week (productivity number) ─────────
        let signedOffByYouThisWeek = 0;
        if (role !== 'ADMIN' && role !== 'PROGRAM_OPS') {
            const soRes = await client.query<{ c: string }>(
                `SELECT COUNT(*)::text AS c
                   FROM ops_os.submission s
                  WHERE s.signed_off_by = $1
                    AND s.signed_off_at >= $2::date
                    AND s.auto_signed_off = false`,
                [userId, weekStartYmd],
            );
            signedOffByYouThisWeek = parseInt(soRes.rows[0]?.c ?? '0', 10);
        }

        // ── Reminders sent to you today (Friday/EOD nudges, etc.) ─────
        const remRes = await client.query<{ c: string }>(
            `SELECT COUNT(*)::text AS c
               FROM ops_os.reminder_dispatch
              WHERE recipient_user_id = $1
                AND period_start = $2::date`,
            [userId, today],
        );
        const remindersToYouToday = parseInt(remRes.rows[0]?.c ?? '0', 10);

        return {
            campuses,
            waiting,
            sentBack,
            missingToday,
            avgReviewMinutes,
            nonResponseCount,
            signedOffByYouThisWeek,
            remindersToYouToday,
        };
    });

    return {
        role,
        today,
        ...data,
    };
};
