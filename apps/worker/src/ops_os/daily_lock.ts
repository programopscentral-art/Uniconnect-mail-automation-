/**
 * Daily-lock worker.
 *
 * V1 policy: every 10 minutes, scan for SIGNED_OFF DAILY submissions whose
 * period_end is in the past (more than the current IST EOD window has
 * elapsed) and transition them to LOCKED. The transition is idempotent —
 * re-running on an already-LOCKED row is a no-op.
 *
 * No campus-timezone differentiation in V1; all NIAT campuses are IST.
 * EOD cutoff is 18:30 IST (≈ 13:00 UTC). A submission for period_end = D
 * becomes eligible to lock once "now" is past D + 18:30 IST.
 *
 * locked_by is intentionally NULL for system-initiated locks (event_log
 * actor_user_id is also NULL); the lock event still records the transition.
 */

import { db, transitionToLocked } from '@uniconnect/shared';

const LOCK_INTERVAL_MS = 10 * 60 * 1000; // 10 min
const EOD_HOUR_IST = 18;
const EOD_MIN_IST = 30;

/**
 * Return the latest period_end date (YYYY-MM-DD) whose IST EOD has already
 * passed. Submissions with period_end ≤ this date are eligible to lock.
 */
function lastLockablePeriodEnd(now: Date): string {
    // Build "today 18:30 IST" in UTC. IST = UTC+5:30, so 18:30 IST = 13:00 UTC.
    const utcCutoffHour = EOD_HOUR_IST - 5; // 13
    const utcCutoffMin = EOD_MIN_IST - 30; // 0
    const cutoff = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        utcCutoffHour,
        utcCutoffMin,
        0,
    ));

    // If now is past today's cutoff, today's period_end is lockable.
    // Otherwise only yesterday and earlier.
    const istNow = new Date(now.getTime() + (5 * 60 + 30) * 60 * 1000);
    const istDate = new Date(Date.UTC(
        istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate(),
    ));
    if (now >= cutoff) {
        return istDate.toISOString().slice(0, 10);
    }
    // Yesterday in IST
    const y = new Date(istDate.getTime() - 24 * 60 * 60 * 1000);
    return y.toISOString().slice(0, 10);
}

export async function runDailyLockCycle(): Promise<{ scanned: number; locked: number; failed: number }> {
    const lastEnd = lastLockablePeriodEnd(new Date());
    const client = await db.connect();
    let scanned = 0, locked = 0, failed = 0;
    try {
        // Fetch eligible rows (no RLS context — system query).
        // We don't use findSubmissionsToLock from the shared package here
        // because we want to scan ALL period_ends ≤ lastEnd in one pass,
        // not just one specific date.
        const r = await client.query<{ submission_id: string; campus_id: string; period_end: string }>(
            `SELECT submission_id, campus_id, period_end
             FROM ops_os.submission
             WHERE cadence = 'DAILY'
               AND status = 'SIGNED_OFF'
               AND locked_at IS NULL
               AND period_end <= $1::date
             ORDER BY period_end, campus_id
             LIMIT 500`,
            [lastEnd],
        );
        scanned = r.rowCount ?? 0;

        for (const row of r.rows) {
            // Per-row mini-tx so one failure doesn't poison the rest
            try {
                await client.query('BEGIN');
                const sub = await transitionToLocked(
                    { submission_id: row.submission_id, locked_by: null },
                    client,
                );
                await client.query('COMMIT');
                if (sub) locked++;
            } catch (e) {
                failed++;
                try { await client.query('ROLLBACK'); } catch { /* noop */ }
                console.error(
                    JSON.stringify({
                        ts: new Date().toISOString(),
                        level: 'error',
                        scope: 'ops_os.daily_lock',
                        msg: 'lock_failed',
                        submission_id: row.submission_id,
                        campus_id: row.campus_id,
                        error: (e as Error).message,
                    }),
                );
            }
        }
    } finally {
        client.release();
    }

    if (scanned > 0 || locked > 0) {
        console.log(
            JSON.stringify({
                ts: new Date().toISOString(),
                level: 'info',
                scope: 'ops_os.daily_lock',
                msg: 'cycle_complete',
                last_lockable_period_end: lastEnd,
                scanned, locked, failed,
            }),
        );
    }

    return { scanned, locked, failed };
}

/**
 * Start the recurring daily-lock loop. Call once from the worker entry
 * point. The interval is short (10 min) so even if the process restarts
 * the lock will catch up within one cycle.
 */
export function startDailyLockLoop(): void {
    // Fire once on boot (after a 30s grace so the rest of the worker is up)
    setTimeout(() => {
        runDailyLockCycle().catch((e) =>
            console.error('[OPS_OS_DAILY_LOCK] initial cycle failed:', (e as Error).message),
        );
    }, 30 * 1000);

    setInterval(() => {
        runDailyLockCycle().catch((e) =>
            console.error('[OPS_OS_DAILY_LOCK] cycle failed:', (e as Error).message),
        );
    }, LOCK_INTERVAL_MS);

    console.log('[OPS_OS_DAILY_LOCK] ✅ Loop started (10-min interval)');
}
