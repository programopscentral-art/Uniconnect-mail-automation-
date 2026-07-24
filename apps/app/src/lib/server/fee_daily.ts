/**
 * Fee Collection v2 — Daily Report per-university snapshot.
 *
 * The Daily Report shows Fully Paid / Partial counts per university for a given
 * calendar day. The window-level `fee_collection_snapshot` is too coarse for
 * this, so we keep a separate per-(window, university, date) table that gets
 * FROZEN at 20:00 IST (`locked=true`). Before 8 PM the report computes live
 * counts straight from `fee_student_payments`; once a locked snapshot exists for
 * the day, the report serves that frozen copy so the numbers stop moving.
 *
 * `captureDailyUniversitySnapshot` is called by:
 *   - the worker's 20:00 IST job (locked=true), and
 *   - an admin "lock now" trigger (locked=true).
 * It is idempotent per day: the first locked capture wins; a later capture only
 * upgrades a still-unlocked row and never overwrites an already-frozen day.
 */
import { db } from '@uniconnect/shared';
import { todayInIST } from './fee_access';

export interface DailyUniversityRow {
    university_id: string;
    university_name: string;
    total: number;
    fully_paid: number;
    partial: number;
    yet_to_pay: number;
    total_payable: number;
    total_paid: number;
}

/**
 * Live per-university counts for a window, computed from the current
 * fee_student_payments state (i.e. "as of right now").
 */
async function computeLiveDaily(window_id: string): Promise<DailyUniversityRow[]> {
    const r = await db.query(
        `SELECT u.id AS university_id,
                COALESCE(u.short_name, u.name)                              AS university_name,
                COUNT(fsp.id)::int                                          AS total,
                COUNT(*) FILTER (WHERE fsp.status = 'Fully Paid')::int      AS fully_paid,
                COUNT(*) FILTER (WHERE fsp.status = 'Partially Paid')::int  AS partial,
                COUNT(*) FILTER (WHERE fsp.status = 'Yet To Pay')::int      AS yet_to_pay,
                COALESCE(SUM(fsp.payable), 0)                               AS total_payable,
                COALESCE(SUM(fsp.paid), 0)                                  AS total_paid
           FROM fee_student_payments fsp
           JOIN fee_batch_period bp ON bp.id = fsp.batch_period_id
           JOIN universities u ON u.id = fsp.university_id
          WHERE bp.window_id = $1
          GROUP BY u.id, COALESCE(u.short_name, u.name)
          ORDER BY university_name`,
        [window_id],
    );
    return r.rows.map((row: any) => ({
        university_id: row.university_id,
        university_name: row.university_name,
        total: Number(row.total),
        fully_paid: Number(row.fully_paid),
        partial: Number(row.partial),
        yet_to_pay: Number(row.yet_to_pay),
        total_payable: Number(row.total_payable),
        total_paid: Number(row.total_paid),
    }));
}

/**
 * Freeze today's per-university counts into fee_daily_university_snapshot.
 * Idempotent: an already-locked day is preserved; an unlocked row is upgraded.
 */
export async function captureDailyUniversitySnapshot(
    window_id: string,
    opts: { locked?: boolean } = {},
): Promise<{ window_id: string; snapshot_date: string; universities: number }> {
    const locked = opts.locked ?? true;
    const snapshot_date = todayInIST();
    const rows = await computeLiveDaily(window_id);
    if (rows.length === 0) return { window_id, snapshot_date, universities: 0 };

    const values: unknown[] = [];
    const placeholders: string[] = [];
    rows.forEach((r, i) => {
        const o = i * 10;
        placeholders.push(
            `($${o+1},$${o+2},$${o+3}::date,$${o+4},$${o+5},$${o+6},$${o+7},$${o+8},$${o+9},$${o+10},now())`,
        );
        values.push(
            window_id, r.university_id, snapshot_date, r.total, r.fully_paid,
            r.partial, r.yet_to_pay, r.total_payable, r.total_paid, locked,
        );
    });
    await db.query(
        `INSERT INTO fee_daily_university_snapshot
            (window_id, university_id, snapshot_date, total, fully_paid, partial,
             yet_to_pay, total_payable, total_paid, locked, captured_at)
         VALUES ${placeholders.join(',')}
         ON CONFLICT (window_id, university_id, snapshot_date) DO UPDATE SET
            total         = EXCLUDED.total,
            fully_paid    = EXCLUDED.fully_paid,
            partial       = EXCLUDED.partial,
            yet_to_pay    = EXCLUDED.yet_to_pay,
            total_payable = EXCLUDED.total_payable,
            total_paid    = EXCLUDED.total_paid,
            locked        = EXCLUDED.locked,
            captured_at   = now()
          WHERE fee_daily_university_snapshot.locked = false`,
        values,
    );
    return { window_id, snapshot_date, universities: rows.length };
}

/**
 * Freeze today's snapshot for every active window (worker entry point).
 */
export async function captureAllActiveWindows(): Promise<
    Array<{ window_id: string; snapshot_date: string; universities: number }>
> {
    const wins = await db.query<{ id: string }>(
        `SELECT id FROM fee_semester_window WHERE status = 'active'`,
    );
    const out = [];
    for (const w of wins.rows) {
        out.push(await captureDailyUniversitySnapshot(w.id, { locked: true }));
    }
    return out;
}

/**
 * Read the Daily Report for one window + date.
 *
 *   - A locked snapshot exists for the date       → serve it (frozen).
 *   - The date is today and no lock yet            → compute live.
 *   - A past date with no snapshot (feature wasn't
 *     live yet, or window had no data)             → empty rows, locked=false.
 */
export async function getDailyReport(
    window_id: string,
    date: string,
): Promise<{ date: string; locked: boolean; is_today: boolean; universities: DailyUniversityRow[] }> {
    const today = todayInIST();
    const is_today = date === today;

    const snap = await db.query(
        `SELECT s.university_id,
                COALESCE(u.short_name, u.name) AS university_name,
                s.total, s.fully_paid, s.partial, s.yet_to_pay,
                s.total_payable, s.total_paid, s.locked
           FROM fee_daily_university_snapshot s
           JOIN universities u ON u.id = s.university_id
          WHERE s.window_id = $1 AND s.snapshot_date = $2::date
          ORDER BY university_name`,
        [window_id, date],
    );

    const anyLocked = snap.rows.some((r: any) => r.locked);
    // Serve the frozen snapshot when it's locked, or whenever the date is in the
    // past (a past unlocked snapshot is still the best record we have).
    if (snap.rows.length > 0 && (anyLocked || !is_today)) {
        return {
            date,
            locked: anyLocked,
            is_today,
            universities: snap.rows.map((r: any) => ({
                university_id: r.university_id,
                university_name: r.university_name,
                total: Number(r.total),
                fully_paid: Number(r.fully_paid),
                partial: Number(r.partial),
                yet_to_pay: Number(r.yet_to_pay),
                total_payable: Number(r.total_payable),
                total_paid: Number(r.total_paid),
            })),
        };
    }

    // No usable snapshot. For today, compute live. For a past date with nothing
    // stored, return empty (we have no historical record).
    if (is_today) {
        return { date, locked: false, is_today, universities: await computeLiveDaily(window_id) };
    }
    return { date, locked: false, is_today, universities: [] };
}
