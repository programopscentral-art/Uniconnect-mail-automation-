/**
 * Auto-sign-off worker.
 *
 * Scans every 5 minutes for DAILY submissions still in SUBMITTED / PM_REVIEW /
 * SENT_BACK status whose period_end has reached the 6:30 PM IST PM deadline.
 * For each, transitions to SIGNED_OFF with auto_signed_off=true, increments
 * the assigned PM(s)'s non_response_count, and fans out notifications +
 * emails to BOA / PMs / COS / admins.
 *
 * Idempotent: transitionToAutoSignedOff only matches rows still in the
 * pre-sign-off states. Re-running the loop on already-completed rows is a
 * no-op.
 */

import {
    db,
    transitionToAutoSignedOff,
    notifyOnAutoSignOff,
} from '@uniconnect/shared';

const CYCLE_INTERVAL_MS = 5 * 60 * 1000; // 5 min
const PM_DEADLINE_HOUR_IST = 18;
const PM_DEADLINE_MIN_IST = 30;

/**
 * Return the latest period_end date whose 6:30 PM IST PM deadline has
 * already passed. Submissions with period_end ≤ this date and still in
 * pre-sign-off status are eligible to auto-sign-off.
 */
function lastAutoSignablePeriodEnd(now: Date): string {
    // 18:30 IST = 13:00 UTC
    const utcCutoff = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        PM_DEADLINE_HOUR_IST - 5,
        PM_DEADLINE_MIN_IST - 30,
        0,
    ));
    // Today's IST date
    const istNow = new Date(now.getTime() + (5 * 60 + 30) * 60 * 1000);
    const istDate = new Date(Date.UTC(
        istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate(),
    ));
    if (now >= utcCutoff) return istDate.toISOString().slice(0, 10);
    // Yesterday in IST
    return new Date(istDate.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function runAutoSignOffCycle(): Promise<{ scanned: number; autoSigned: number; failed: number }> {
    const lastEnd = lastAutoSignablePeriodEnd(new Date());
    const client = await db.connect();
    let scanned = 0, autoSigned = 0, failed = 0;
    try {
        const r = await client.query<{
            submission_id: string;
            campus_id: string;
            period_end: string;
            status: string;
        }>(
            `SELECT submission_id, campus_id, period_end, status
               FROM ops_os.submission
              WHERE cadence = 'DAILY'
                AND status IN ('SUBMITTED', 'PM_REVIEW', 'SENT_BACK')
                AND period_end <= $1::date
              ORDER BY period_end, campus_id
              LIMIT 500`,
            [lastEnd],
        );
        scanned = r.rowCount ?? 0;

        for (const row of r.rows) {
            try {
                await client.query('BEGIN');
                const sub = await transitionToAutoSignedOff(
                    {
                        submission_id: row.submission_id,
                        pm_remark: 'Auto-signed-off — PM did not respond by 6:30 PM IST deadline. Recorded on PM responsiveness counter.',
                    },
                    client,
                );
                if (!sub) {
                    await client.query('ROLLBACK');
                    continue;
                }
                const campusRow = await client.query<{ display_name: string; code: string }>(
                    `SELECT display_name, code FROM ops_os.campus_dim WHERE campus_id = $1`,
                    [sub.campus_id],
                );
                await notifyOnAutoSignOff(sub, campusRow.rows[0] ?? null, client);
                await client.query('COMMIT');
                autoSigned++;
            } catch (e) {
                failed++;
                try { await client.query('ROLLBACK'); } catch { /* noop */ }
                console.error(
                    JSON.stringify({
                        ts: new Date().toISOString(),
                        level: 'error',
                        scope: 'ops_os.auto_sign_off',
                        msg: 'auto_sign_off_failed',
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

    if (scanned > 0 || autoSigned > 0) {
        console.log(
            JSON.stringify({
                ts: new Date().toISOString(),
                level: 'info',
                scope: 'ops_os.auto_sign_off',
                msg: 'cycle_complete',
                last_eligible_period_end: lastEnd,
                scanned, auto_signed: autoSigned, failed,
            }),
        );
    }

    return { scanned, autoSigned, failed };
}

export function startAutoSignOffLoop(): void {
    setTimeout(() => {
        runAutoSignOffCycle().catch((e) =>
            console.error('[OPS_OS_AUTO_SIGN_OFF] initial cycle failed:', (e as Error).message),
        );
    }, 45 * 1000);

    setInterval(() => {
        runAutoSignOffCycle().catch((e) =>
            console.error('[OPS_OS_AUTO_SIGN_OFF] cycle failed:', (e as Error).message),
        );
    }, CYCLE_INTERVAL_MS);

    console.log('[OPS_OS_AUTO_SIGN_OFF] ✅ Loop started (5-min interval, 6:30 PM IST deadline)');
}
