/**
 * Reminder loop — time-of-day triggers for BOA/PM nudges.
 *
 * The actual send logic lives in packages/shared/src/ops_os/reminders.ts
 * (so admins can also fire it manually via /api/ops-os/reminders/fire).
 * This file owns the scheduling: every 60 seconds it checks if "now in IST"
 * falls inside one of three trigger windows and, if so, runs the matching
 * reminder kind. The reminder_dispatch dedupe prevents duplicate sends if
 * the loop runs multiple times within a single window.
 *
 *   3:30 PM IST  boa_submit_due_soon (window: 15 min)
 *   4:30 PM IST  pm_review_open      (window: 15 min)
 *   6:00 PM IST  pm_review_final     (window: 20 min)
 */

import { db, runReminder, todayInIst, type ReminderKind } from '@uniconnect/shared';

const CYCLE_INTERVAL_MS = 60 * 1000;

interface ReminderTrigger {
    kind: ReminderKind;
    istHour: number;
    istMinute: number;
    windowMinutes: number;
}

const TRIGGERS: ReminderTrigger[] = [
    { kind: 'boa_submit_due_soon', istHour: 15, istMinute: 30, windowMinutes: 15 },
    { kind: 'pm_review_open',      istHour: 16, istMinute: 30, windowMinutes: 15 },
    { kind: 'pm_review_final',     istHour: 18, istMinute: 0,  windowMinutes: 20 },
];

function nowInIst(now: Date): { hour: number; minute: number } {
    const ist = new Date(now.getTime() + (5 * 60 + 30) * 60 * 1000);
    return { hour: ist.getUTCHours(), minute: ist.getUTCMinutes() };
}

function withinTriggerWindow(now: Date, t: ReminderTrigger): boolean {
    const ist = nowInIst(now);
    const istMinutes = ist.hour * 60 + ist.minute;
    const tMinutes = t.istHour * 60 + t.istMinute;
    return istMinutes >= tMinutes && istMinutes < tMinutes + t.windowMinutes;
}

export async function runReminderCycle(): Promise<void> {
    const now = new Date();
    const periodDate = todayInIst();

    for (const t of TRIGGERS) {
        if (!withinTriggerWindow(now, t)) continue;
        const client = await db.connect();
        try {
            const result = await runReminder(t.kind, periodDate, client);
            if (result.sent > 0 || result.skipped_already_sent > 0) {
                console.log(
                    JSON.stringify({
                        ts: new Date().toISOString(),
                        level: 'info',
                        scope: 'ops_os.reminders',
                        msg: 'reminder_batch_complete',
                        kind: t.kind,
                        period_start: result.period_start,
                        sent: result.sent,
                        skipped_already_sent: result.skipped_already_sent,
                        email_attempts: result.email_attempts,
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
        } finally {
            client.release();
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
