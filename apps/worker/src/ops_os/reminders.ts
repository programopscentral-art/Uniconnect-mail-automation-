/**
 * Reminder workers.
 *
 * Three time-of-day triggers per IST calendar day:
 *
 *   3:30 PM IST  BOA submit-due-soon — for every active BOA on every active
 *                campus whose draft is not yet SUBMITTED, send an in-app +
 *                email reminder that the 4:00 PM cutoff is 30 minutes away.
 *
 *   4:30 PM IST  PM review-open — for every PM with at least one campus
 *                submission still awaiting decision (SUBMITTED or PM_REVIEW),
 *                send an in-app + email reminder.
 *
 *   6:00 PM IST  PM final reminder — same audience, last call before the
 *                6:30 PM auto-sign-off cuts in.
 *
 * Each (kind, period_start, recipient_user_id, campus_id) is recorded in
 * ops_os.reminder_dispatch with a UNIQUE constraint so re-running the loop
 * inside the same minute window can't fire duplicate sends.
 */

import { db, sendEmail, getUserEmail } from '@uniconnect/shared';

const CYCLE_INTERVAL_MS = 60 * 1000; // 1 min — granular enough to catch each window

interface ReminderTrigger {
    kind: 'boa_submit_due_soon' | 'pm_review_open' | 'pm_review_final';
    istHour: number;
    istMinute: number;
    windowMinutes: number; // how many minutes after the trigger to keep firing if missed
}

const TRIGGERS: ReminderTrigger[] = [
    { kind: 'boa_submit_due_soon', istHour: 15, istMinute: 30, windowMinutes: 15 },
    { kind: 'pm_review_open',      istHour: 16, istMinute: 30, windowMinutes: 15 },
    { kind: 'pm_review_final',     istHour: 18, istMinute: 0,  windowMinutes: 20 },
];

// ── IST helpers ──────────────────────────────────────────────────────────

function nowInIst(now: Date): { hour: number; minute: number; date: string } {
    const ist = new Date(now.getTime() + (5 * 60 + 30) * 60 * 1000);
    return {
        hour: ist.getUTCHours(),
        minute: ist.getUTCMinutes(),
        date: ist.toISOString().slice(0, 10),
    };
}

function withinTriggerWindow(now: Date, t: ReminderTrigger): boolean {
    const ist = nowInIst(now);
    const istMinutes = ist.hour * 60 + ist.minute;
    const tMinutes = t.istHour * 60 + t.istMinute;
    return istMinutes >= tMinutes && istMinutes < tMinutes + t.windowMinutes;
}

// ── BOA reminder ─────────────────────────────────────────────────────────

async function runBoaReminder(periodDate: string): Promise<{ sent: number }> {
    let sent = 0;
    const client = await db.connect();
    try {
        // BOAs assigned to a campus that does NOT have a SUBMITTED/SIGNED_OFF
        // submission for today yet.
        const r = await client.query<{
            user_id: string;
            campus_id: string;
            campus_name: string;
            campus_code: string;
            submission_id: string | null;
        }>(
            `SELECT DISTINCT uca.user_id, cd.campus_id, cd.display_name AS campus_name, cd.code AS campus_code,
                    s.submission_id
               FROM ops_os.user_campus_assignment uca
               JOIN ops_os.campus_dim cd ON cd.campus_id = uca.campus_id AND cd.status = 'active'
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

        for (const row of r.rows) {
            // dedupe insert
            const dedup = await client.query(
                `INSERT INTO ops_os.reminder_dispatch (kind, period_start, campus_id, submission_id, recipient_user_id)
                 VALUES ('boa_submit_due_soon', $1::date, $2, $3, $4)
                 ON CONFLICT DO NOTHING
                 RETURNING reminder_id`,
                [periodDate, row.campus_id, row.submission_id, row.user_id],
            );
            if ((dedup.rowCount ?? 0) === 0) continue;

            // in-app notification
            await client.query(
                `INSERT INTO public.notifications (user_id, title, message, type, link, source_id)
                 VALUES ($1, $2, $3, 'SYSTEM', $4, $5)
                 ON CONFLICT (user_id, source_id) WHERE source_id IS NOT NULL DO NOTHING`,
                [
                    row.user_id,
                    `Daily report due in 30 min · ${row.campus_name}`,
                    `Submit your ${periodDate} report before 4:00 PM IST. After that it's flagged as late.`,
                    `/ops-os/report?campus=${row.campus_id}`,
                    `OPSOS_REMINDER_BOA_${periodDate}_${row.user_id}_${row.campus_id}`,
                ],
            );

            // email
            const u = await getUserEmail(row.user_id, client);
            if (u) {
                sendEmail({
                    to: u.email,
                    subject: `[NIAT Ops] Daily report due in 30 min · ${row.campus_name}`,
                    intro: 'Reminder · 30 min to deadline',
                    bodyHtml: `<p>Your daily report for <strong>${row.campus_name}</strong> on <strong>${periodDate}</strong> isn't submitted yet.</p>
                               <p>The submission deadline is <strong>4:00 PM IST</strong>. Anything later is flagged as late on the PM's queue and counts toward the campus reliability metric.</p>`,
                    ctaLabel: 'Open daily report',
                    ctaUrl: `/ops-os/report?campus=${row.campus_id}`,
                    tone: 'warn',
                }).catch(() => { /* logged inside */ });
            }
            sent++;
        }
    } finally {
        client.release();
    }
    return { sent };
}

// ── PM reminders (open + final) ──────────────────────────────────────────

async function runPmReminder(
    kind: 'pm_review_open' | 'pm_review_final',
    periodDate: string,
): Promise<{ sent: number }> {
    let sent = 0;
    const client = await db.connect();
    try {
        // PMs with at least one SUBMITTED/PM_REVIEW submission for periodDate
        // (i.e., something is actually waiting on them)
        const r = await client.query<{
            user_id: string;
            campus_id: string;
            campus_name: string;
            campus_code: string;
            submission_id: string;
        }>(
            `SELECT DISTINCT uca.user_id, cd.campus_id, cd.display_name AS campus_name, cd.code AS campus_code,
                    s.submission_id
               FROM ops_os.user_campus_assignment uca
               JOIN ops_os.campus_dim cd ON cd.campus_id = uca.campus_id AND cd.status = 'active'
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

        for (const row of r.rows) {
            const dedup = await client.query(
                `INSERT INTO ops_os.reminder_dispatch (kind, period_start, campus_id, submission_id, recipient_user_id)
                 VALUES ($1, $2::date, $3, $4, $5)
                 ON CONFLICT DO NOTHING
                 RETURNING reminder_id`,
                [kind, periodDate, row.campus_id, row.submission_id, row.user_id],
            );
            if ((dedup.rowCount ?? 0) === 0) continue;

            const isFinal = kind === 'pm_review_final';
            const title = isFinal
                ? `⚠ Final reminder · ${row.campus_name} sign-off`
                : `Awaiting your decision · ${row.campus_name}`;
            const subject = isFinal
                ? `[NIAT Ops] FINAL · sign off in 30 min or system auto-closes · ${row.campus_name}`
                : `[NIAT Ops] Submission awaiting your review · ${row.campus_name}`;
            const intro = isFinal ? 'Auto-sign-off in 30 minutes' : 'Submission awaiting your decision';
            const body = isFinal
                ? `<p>The ${periodDate} report for <strong>${row.campus_name}</strong> still hasn't been signed off.</p>
                   <p>The system auto-closes at <strong>6:30 PM IST</strong>. If you don't review by then, the submission is marked auto-signed-off and a <strong>non-response</strong> is logged against your assignment.</p>`
                : `<p>The BOA at <strong>${row.campus_name}</strong> submitted the ${periodDate} report. It's waiting on you.</p>
                   <p>Please review and either sign off or send back. PM sign-off deadline is <strong>6:30 PM IST</strong>; after that the system auto-completes the submission and logs a non-response.</p>`;

            await client.query(
                `INSERT INTO public.notifications (user_id, title, message, type, link, source_id)
                 VALUES ($1, $2, $3, 'SYSTEM', $4, $5)
                 ON CONFLICT (user_id, source_id) WHERE source_id IS NOT NULL DO NOTHING`,
                [
                    row.user_id,
                    title,
                    isFinal
                        ? `Sign off before 6:30 PM. After that, auto-closed + non-response logged.`
                        : `${row.campus_name} · ${periodDate}. Sign off or send back before 6:30 PM IST.`,
                    `/ops-os/review/${row.submission_id}`,
                    `OPSOS_REMINDER_${kind.toUpperCase()}_${periodDate}_${row.user_id}_${row.campus_id}`,
                ],
            );

            const u = await getUserEmail(row.user_id, client);
            if (u) {
                sendEmail({
                    to: u.email,
                    subject,
                    intro,
                    bodyHtml: body,
                    ctaLabel: 'Open review',
                    ctaUrl: `/ops-os/review/${row.submission_id}`,
                    tone: isFinal ? 'alert' : 'info',
                }).catch(() => { /* logged inside */ });
            }
            sent++;
        }
    } finally {
        client.release();
    }
    return { sent };
}

// ── Cycle ────────────────────────────────────────────────────────────────

export async function runReminderCycle(): Promise<void> {
    const now = new Date();
    const ist = nowInIst(now);

    for (const t of TRIGGERS) {
        if (!withinTriggerWindow(now, t)) continue;
        try {
            let result: { sent: number };
            if (t.kind === 'boa_submit_due_soon') {
                result = await runBoaReminder(ist.date);
            } else {
                result = await runPmReminder(t.kind, ist.date);
            }
            if (result.sent > 0) {
                console.log(
                    JSON.stringify({
                        ts: new Date().toISOString(),
                        level: 'info',
                        scope: 'ops_os.reminders',
                        msg: 'reminder_batch_sent',
                        kind: t.kind,
                        period_start: ist.date,
                        sent: result.sent,
                    }),
                );
            }
        } catch (e) {
            console.error(
                JSON.stringify({
                    ts: new Date().toISOString(),
                    level: 'error',
                    scope: 'ops_os.reminders',
                    msg: 'reminder_batch_failed',
                    kind: t.kind,
                    error: (e as Error).message,
                }),
            );
        }
    }
}

export function startReminderLoop(): void {
    setTimeout(() => {
        runReminderCycle().catch((e) =>
            console.error('[OPS_OS_REMINDERS] initial cycle failed:', (e as Error).message),
        );
    }, 60 * 1000);

    setInterval(() => {
        runReminderCycle().catch((e) =>
            console.error('[OPS_OS_REMINDERS] cycle failed:', (e as Error).message),
        );
    }, CYCLE_INTERVAL_MS);

    console.log('[OPS_OS_REMINDERS] ✅ Loop started (1-min granularity, triggers: 3:30 PM / 4:30 PM / 6:00 PM IST)');
}
