/**
 * Operations OS — reminder send logic.
 *
 * Shared between the time-of-day worker (apps/worker) and an admin
 * "fire now" / "diagnose" endpoint (apps/app). Both call into the same
 * functions so the BOA and PM email content stays in sync.
 *
 * Each send is deduped via ops_os.reminder_dispatch's UNIQUE INDEX on
 * (kind, period_start, recipient_user_id, COALESCE(campus_id, ...)).
 * Re-running for the same recipient within the same day is a safe no-op.
 */

import type { PoolClient } from 'pg';
import { sendEmail, getUserEmail } from './email';

export type ReminderKind = 'boa_submit_due_soon' | 'pm_review_open' | 'pm_review_final';

export interface ReminderRecipient {
    user_id: string;
    user_email: string | null;
    user_name: string | null;
    campus_id: string;
    campus_name: string;
    campus_code: string;
    submission_id: string | null;
    /** true if a reminder_dispatch row was inserted (or would be) */
    eligible: boolean;
    /** true if the recipient was already sent today's reminder */
    already_sent: boolean;
}

export interface ReminderRunResult {
    kind: ReminderKind;
    period_start: string;
    recipients: ReminderRecipient[];
    sent: number;
    skipped_already_sent: number;
    email_attempts: number;
}

// ── Recipient queries ────────────────────────────────────────────────────

async function queryBoaRecipients(periodDate: string, client: PoolClient) {
    // Includes BOA-role assignments. PMA users have a BOA-role assignment
    // row inserted by auto_assign, so they're picked up here automatically.
    const r = await client.query<{
        user_id: string;
        user_email: string | null;
        user_name: string | null;
        campus_id: string;
        campus_name: string;
        campus_code: string;
        submission_id: string | null;
    }>(
        `SELECT DISTINCT uca.user_id,
                u.email AS user_email,
                COALESCE(u.name, u.email) AS user_name,
                cd.campus_id, cd.display_name AS campus_name, cd.code AS campus_code,
                s.submission_id
           FROM ops_os.user_campus_assignment uca
           JOIN ops_os.campus_dim cd ON cd.campus_id = uca.campus_id AND cd.status = 'active'
           JOIN public.users u ON u.id = uca.user_id
                                AND (u.is_active IS NULL OR u.is_active = true)
                                AND u.email IS NOT NULL
                                AND u.role IN ('BOA', 'PMA')
           LEFT JOIN ops_os.submission s
                  ON s.campus_id = cd.campus_id
                 AND s.cadence = 'DAILY'
                 AND s.period_start = $1::date
                 AND s.supersedes IS NULL
          WHERE uca.role = 'BOA'
            AND uca.revoked_at IS NULL
            AND (s.status IS NULL OR s.status IN ('NEW', 'DRAFT', 'SENT_BACK'))`,
        [periodDate],
    );
    return r.rows;
}

async function queryPmRecipients(periodDate: string, client: PoolClient) {
    const r = await client.query<{
        user_id: string;
        user_email: string | null;
        user_name: string | null;
        campus_id: string;
        campus_name: string;
        campus_code: string;
        submission_id: string;
    }>(
        `SELECT DISTINCT uca.user_id,
                u.email AS user_email,
                COALESCE(u.name, u.email) AS user_name,
                cd.campus_id, cd.display_name AS campus_name, cd.code AS campus_code,
                s.submission_id
           FROM ops_os.user_campus_assignment uca
           JOIN ops_os.campus_dim cd ON cd.campus_id = uca.campus_id AND cd.status = 'active'
           JOIN public.users u ON u.id = uca.user_id
                                AND (u.is_active IS NULL OR u.is_active = true)
                                AND u.email IS NOT NULL
           JOIN ops_os.submission s
             ON s.campus_id = cd.campus_id
            AND s.cadence = 'DAILY'
            AND s.period_start = $1::date
            AND s.status IN ('SUBMITTED', 'PM_REVIEW')
            AND s.supersedes IS NULL
          WHERE uca.role = 'PM'
            AND uca.revoked_at IS NULL`,
        [periodDate],
    );
    return r.rows;
}

async function queryRecipients(kind: ReminderKind, periodDate: string, client: PoolClient) {
    if (kind === 'boa_submit_due_soon') return queryBoaRecipients(periodDate, client);
    return queryPmRecipients(periodDate, client);
}

/**
 * Broadcast mode: ignore ops_os.user_campus_assignment and instead pull every
 * active user whose public.users.role matches the reminder kind. Used during
 * rollout when campus assignments don't exist yet and we still want every
 * BOA / PM to receive the nudge.
 *
 * Returned rows have campus_id = null and submission_id = null. The reminder
 * dispatch unique index handles null via COALESCE so per-user dedupe still
 * works (one row per user per kind per day).
 */
async function queryBroadcastRecipients(
    kind: ReminderKind,
    client: PoolClient,
): Promise<Array<{
    user_id: string;
    user_email: string | null;
    user_name: string | null;
    campus_id: string | null;
    campus_name: string;
    campus_code: string;
    submission_id: string | null;
}>> {
    const rolesByKind: Record<ReminderKind, string[]> = {
        boa_submit_due_soon: ['BOA'],
        pm_review_open:      ['PM', 'PMA'],
        pm_review_final:     ['PM', 'PMA'],
    };
    const roles = rolesByKind[kind];

    const r = await client.query<{
        user_id: string;
        user_email: string | null;
        user_name: string | null;
        university_name: string | null;
    }>(
        `SELECT u.id AS user_id,
                u.email AS user_email,
                COALESCE(u.name, u.email) AS user_name,
                uni.name AS university_name
           FROM public.users u
           LEFT JOIN public.universities uni ON uni.id = u.university_id
          WHERE u.role = ANY($1::text[])
            AND (u.is_active IS NULL OR u.is_active = true)
            AND u.email IS NOT NULL
            AND u.email <> ''
          ORDER BY u.email`,
        [roles],
    );

    return r.rows.map(row => ({
        user_id: row.user_id,
        user_email: row.user_email,
        user_name: row.user_name,
        campus_id: null,
        campus_name: row.university_name ?? 'your campus',
        campus_code: '',
        submission_id: null,
    }));
}

// ── Mail content ─────────────────────────────────────────────────────────

interface ReminderContent {
    subject: string;
    intro: string;
    bodyHtml: string;
    notification_title: string;
    notification_body: string;
    ctaLabel: string;
    ctaUrl: string;
    tone: 'info' | 'warn' | 'alert';
}

function buildBoaContent(periodDate: string, campusName: string, campusId: string | null): ReminderContent {
    const isBroadcast = !campusId;
    const ctaUrl = campusId ? `/ops-os/report?campus=${campusId}` : '/ops-os/report';
    return {
        subject: isBroadcast
            ? `[NIAT Ops] Daily report — submit before 4:00 PM IST`
            : `[NIAT Ops] Daily report due in 30 min · ${campusName}`,
        intro: isBroadcast
            ? 'Daily report due today'
            : 'Reminder · 30 min to deadline',
        bodyHtml: isBroadcast
            ? `<p>This is a reminder that your <strong>${periodDate}</strong> daily report needs to be submitted before <strong>4:00 PM IST</strong> today.</p>
               <p>Open the Daily Report page in UniConnect and complete every section. Reports submitted after the deadline are flagged as late on the PM's queue.</p>
               <p style="color:#71717a;font-size:12px;">If you don't see the Daily Report page, contact your admin to be assigned to a campus in Access Rights.</p>`
            : `<p>Your daily report for <strong>${campusName}</strong> on <strong>${periodDate}</strong> isn't submitted yet.</p>
               <p>The submission deadline is <strong>4:00 PM IST</strong>. Anything later is flagged as late on the PM's queue and counts toward the campus reliability metric.</p>`,
        notification_title: isBroadcast
            ? `Daily report due today before 4:00 PM`
            : `Daily report due in 30 min · ${campusName}`,
        notification_body: isBroadcast
            ? `Submit your ${periodDate} report before 4:00 PM IST.`
            : `Submit your ${periodDate} report before 4:00 PM IST. After that it's flagged as late.`,
        ctaLabel: 'Open daily report',
        ctaUrl,
        tone: 'warn',
    };
}

function buildPmContent(
    kind: 'pm_review_open' | 'pm_review_final',
    periodDate: string,
    campusName: string,
    submissionId: string | null,
): ReminderContent {
    const isFinal = kind === 'pm_review_final';
    const isBroadcast = !submissionId;
    const ctaUrl = submissionId ? `/ops-os/review/${submissionId}` : '/ops-os/review';

    if (isBroadcast) {
        return {
            subject: isFinal
                ? `[NIAT Ops] FINAL · sign off any pending reports in 30 min`
                : `[NIAT Ops] Daily submissions ready for your review`,
            intro: isFinal ? 'Auto-sign-off in 30 minutes' : 'PM review window open',
            bodyHtml: isFinal
                ? `<p>This is the FINAL reminder before <strong>6:30 PM IST</strong> auto-sign-off.</p>
                   <p>Any daily report you haven't signed off by then will be marked <strong>auto-signed-off</strong> and a <strong>non-response</strong> will be logged against your assignment.</p>
                   <p>Open the PM Review Queue and clear pending items.</p>`
                : `<p>Daily reports for ${periodDate} are landing in the PM Review Queue. Please sign off or send back each submission for the campuses you cover.</p>
                   <p>Sign-off deadline is <strong>6:30 PM IST</strong>. After that the system auto-completes anything still pending and logs a non-response.</p>`,
            notification_title: isFinal
                ? `⚠ Final reminder · sign off pending in 30 min`
                : `Daily review queue open`,
            notification_body: isFinal
                ? `Sign off before 6:30 PM. After that, auto-closed + non-response logged.`
                : `Open the PM Review Queue and clear pending items before 6:30 PM IST.`,
            ctaLabel: 'Open review queue',
            ctaUrl,
            tone: isFinal ? 'alert' : 'info',
        };
    }

    return {
        subject: isFinal
            ? `[NIAT Ops] FINAL · sign off in 30 min or system auto-closes · ${campusName}`
            : `[NIAT Ops] Submission awaiting your review · ${campusName}`,
        intro: isFinal ? 'Auto-sign-off in 30 minutes' : 'Submission awaiting your decision',
        bodyHtml: isFinal
            ? `<p>The ${periodDate} report for <strong>${campusName}</strong> still hasn't been signed off.</p>
               <p>The system auto-closes at <strong>6:30 PM IST</strong>. If you don't review by then, the submission is marked auto-signed-off and a <strong>non-response</strong> is logged against your assignment.</p>`
            : `<p>The BOA at <strong>${campusName}</strong> submitted the ${periodDate} report. It's waiting on you.</p>
               <p>Please review and either sign off or send back. PM sign-off deadline is <strong>6:30 PM IST</strong>; after that the system auto-completes the submission and logs a non-response.</p>`,
        notification_title: isFinal
            ? `⚠ Final reminder · ${campusName} sign-off`
            : `Awaiting your decision · ${campusName}`,
        notification_body: isFinal
            ? `Sign off before 6:30 PM. After that, auto-closed + non-response logged.`
            : `${campusName} · ${periodDate}. Sign off or send back before 6:30 PM IST.`,
        ctaLabel: 'Open review',
        ctaUrl,
        tone: isFinal ? 'alert' : 'info',
    };
}

// ── Public: run a reminder cycle ─────────────────────────────────────────

export interface RunReminderOptions {
    /** Force re-send by clearing dedupe rows first. Use only for manual testing. */
    force?: boolean;
    /** Skip the email/notification send and just return who would be reminded. */
    diagnose_only?: boolean;
    /**
     * Broadcast mode: send to every active user whose role matches the kind
     * (BOA / PM / PMA), ignoring ops_os.user_campus_assignment. Useful when
     * campus assignments haven't been set up yet but you still want to
     * notify every BOA/PM. Recipients have no campus context — email +
     * notification copy is generic.
     */
    broadcast?: boolean;
}

export async function runReminder(
    kind: ReminderKind,
    periodDate: string,
    client: PoolClient,
    opts: RunReminderOptions = {},
): Promise<ReminderRunResult> {
    if (opts.force && !opts.diagnose_only) {
        await client.query(
            `DELETE FROM ops_os.reminder_dispatch
              WHERE kind = $1 AND period_start = $2::date`,
            [kind, periodDate],
        );
    }

    const rows = opts.broadcast
        ? await queryBroadcastRecipients(kind, client)
        : await queryRecipients(kind, periodDate, client);
    const recipients: ReminderRecipient[] = [];
    let sent = 0;
    let skipped = 0;
    let emailAttempts = 0;

    for (const row of rows) {
        if (opts.diagnose_only) {
            const existing = await client.query(
                `SELECT 1 FROM ops_os.reminder_dispatch
                  WHERE kind = $1 AND period_start = $2::date
                    AND recipient_user_id = $3
                    AND COALESCE(campus_id, '00000000-0000-0000-0000-000000000000'::uuid)
                      = COALESCE($4::uuid, '00000000-0000-0000-0000-000000000000'::uuid)`,
                [kind, periodDate, row.user_id, row.campus_id],
            );
            recipients.push({
                user_id: row.user_id,
                user_email: row.user_email,
                user_name: row.user_name,
                campus_id: row.campus_id,
                campus_name: row.campus_name,
                campus_code: row.campus_code,
                submission_id: row.submission_id,
                eligible: true,
                already_sent: (existing.rowCount ?? 0) > 0,
            });
            continue;
        }

        const dedup = await client.query(
            `INSERT INTO ops_os.reminder_dispatch (kind, period_start, campus_id, submission_id, recipient_user_id)
             VALUES ($1, $2::date, $3::uuid, $4::uuid, $5)
             ON CONFLICT DO NOTHING
             RETURNING reminder_id`,
            [kind, periodDate, row.campus_id, row.submission_id, row.user_id],
        );
        const wasInserted = (dedup.rowCount ?? 0) > 0;
        recipients.push({
            user_id: row.user_id,
            user_email: row.user_email,
            user_name: row.user_name,
            campus_id: row.campus_id,
            campus_name: row.campus_name,
            campus_code: row.campus_code,
            submission_id: row.submission_id,
            eligible: true,
            already_sent: !wasInserted,
        });

        if (!wasInserted) { skipped++; continue; }

        // Build content
        const content: ReminderContent =
            kind === 'boa_submit_due_soon'
                ? buildBoaContent(periodDate, row.campus_name, row.campus_id)
                : buildPmContent(
                    kind as 'pm_review_open' | 'pm_review_final',
                    periodDate,
                    row.campus_name,
                    row.submission_id,
                );

        // In-app notification
        await client.query(
            `INSERT INTO public.notifications (user_id, title, message, type, link, source_id)
             VALUES ($1, $2, $3, 'SYSTEM', $4, $5)
             ON CONFLICT (user_id, source_id) WHERE source_id IS NOT NULL DO NOTHING`,
            [
                row.user_id,
                content.notification_title,
                content.notification_body,
                content.ctaUrl,
                `OPSOS_REMINDER_${kind.toUpperCase()}_${periodDate}_${row.user_id}_${row.campus_id}`,
            ],
        );

        // Email
        const u = row.user_email
            ? { email: row.user_email, name: row.user_name ?? row.user_email }
            : await getUserEmail(row.user_id, client);
        if (u) {
            emailAttempts++;
            sendEmail({
                to: u.email,
                subject: content.subject,
                intro: content.intro,
                bodyHtml: content.bodyHtml,
                ctaLabel: content.ctaLabel,
                ctaUrl: content.ctaUrl,
                tone: content.tone,
            }).catch(() => { /* logged inside sendEmail */ });
        }
        sent++;
    }

    return {
        kind,
        period_start: periodDate,
        recipients,
        sent,
        skipped_already_sent: skipped,
        email_attempts: emailAttempts,
    };
}

/** Get today's IST date as YYYY-MM-DD. */
export function todayInIst(): string {
    const ist = new Date(Date.now() + (5 * 60 + 30) * 60 * 1000);
    return ist.toISOString().slice(0, 10);
}
