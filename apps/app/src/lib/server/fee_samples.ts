/**
 * Fee Collection v2 — intraday sampling and day-over-day movement.
 *
 * Finance enters payments into the sheet from roughly 8 AM to 9 PM IST. To
 * answer "how much have we collected today" at any point during that window
 * — rather than only the next morning — we take a per-university sample into
 * a 30-minute bucket on every sync. See migration 0113 for why one snapshot
 * per day could not do this.
 *
 * Everything here reads through loadOverviewAggregates, so a sample can never
 * disagree with what the Overview shows at the same moment.
 */
import { db } from '@uniconnect/shared';
import { loadOverviewAggregates } from './fee_overview_v2';

/** Minutes-since-midnight IST, and the 30-minute bucket it falls in. */
export function istSlotNow(at: Date = new Date()): { ist_date: string; slot: number } {
    const ist = new Date(at.getTime() + 5.5 * 60 * 60 * 1000);
    const ist_date = ist.toISOString().slice(0, 10);
    const slot = Math.floor((ist.getUTCHours() * 60 + ist.getUTCMinutes()) / 30);
    return { ist_date, slot };
}

/** "14:30" for slot 29 — used as the x-axis label on the intraday series. */
export function slotLabel(slot: number): string {
    const m = slot * 30;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Capture one per-university sample for the current 30-minute bucket.
 * Idempotent within the bucket — the sync runs every ~5 minutes, so the last
 * write in each bucket wins and a read that landed while the sheet was
 * mid-edit gets corrected minutes later instead of becoming the record.
 */
export async function captureCollectionSample(
    window_id: string,
    at: Date = new Date(),
): Promise<{ ist_date: string; slot: number; universities: number }> {
    const { ist_date, slot } = istSlotNow(at);
    const agg = await loadOverviewAggregates(window_id);
    const rows = agg.per_university;
    if (rows.length === 0) return { ist_date, slot, universities: 0 };

    const values: unknown[] = [];
    const placeholders: string[] = [];
    rows.forEach((r, i) => {
        const o = i * 10;
        placeholders.push(
            `($${o+1},$${o+2},$${o+3}::date,$${o+4},$${o+5},$${o+6},$${o+7},$${o+8},$${o+9},$${o+10},now())`,
        );
        values.push(
            window_id, r.id, ist_date, slot,
            r.total, r.fully_paid, r.partial, r.yet_to_pay,
            r.total_payable, r.total_paid,
        );
    });
    await db.query(
        `INSERT INTO fee_collection_sample
            (window_id, university_id, ist_date, slot, strength, fully_paid,
             partially_paid, yet_to_pay, total_payable, total_paid, sample_at)
         VALUES ${placeholders.join(',')}
         ON CONFLICT (window_id, university_id, ist_date, slot) DO UPDATE SET
            strength       = EXCLUDED.strength,
            fully_paid     = EXCLUDED.fully_paid,
            partially_paid = EXCLUDED.partially_paid,
            yet_to_pay     = EXCLUDED.yet_to_pay,
            total_payable  = EXCLUDED.total_payable,
            total_paid     = EXCLUDED.total_paid,
            sample_at      = now()`,
        values,
    );
    // `source` is uniform across the window in practice; write it separately
    // so the INSERT above stays a single fixed-arity statement.
    const src = agg.provenance.students === 0 ? 'sheet'
              : agg.provenance.sheet === 0 ? 'students' : 'mixed';
    await db.query(
        `UPDATE fee_collection_sample SET source = $4
          WHERE window_id = $1 AND ist_date = $2::date AND slot = $3`,
        [window_id, ist_date, slot, src],
    );
    return { ist_date, slot, universities: rows.length };
}

// ── Reading movement ─────────────────────────────────────────────────────

export interface MovementRow {
    university_id: string;
    university_name: string;
    /** Baseline (the comparison day's closing figures). Null when we have no sample for it. */
    base_fully: number | null;
    base_paid: number | null;
    /** Current (the latest sample on the target day). */
    now_strength: number;
    now_fully: number;
    now_partial: number;
    now_yet: number;
    now_payable: number;
    now_paid: number;
    /** now − base. Null when there is no baseline to subtract. */
    delta_fully: number | null;
    delta_paid: number | null;
}

export interface MovementResult {
    /** The day being reported on. */
    date: string;
    /** The day used as the baseline (its closing sample). */
    base_date: string | null;
    /** True when `date` is today, i.e. the figures are still moving. */
    is_today: boolean;
    /** Bucket of the latest sample on `date`, e.g. "15:30". Null when none. */
    latest_slot_label: string | null;
    /** Bucket of the baseline sample, e.g. "21:30". Null when no baseline. */
    base_slot_label: string | null;
    /** Set when no baseline sample exists — the caller should say so rather than show a delta of 0. */
    baseline_missing: boolean;
    universities: MovementRow[];
    totals: {
        base_fully: number | null; base_paid: number | null;
        now_strength: number; now_fully: number; now_partial: number; now_yet: number;
        now_payable: number; now_paid: number;
        delta_fully: number | null; delta_paid: number | null;
    };
    /** Window-wide totals per 30-min bucket on `date`, for the intraday chart. */
    series: Array<{ slot: number; label: string; paid: number; fully: number }>;
}

const n = (v: unknown): number => Number(v ?? 0) || 0;

/**
 * Latest sample per university on `date` (the "now" side), compared against
 * the closing sample of `baseDate` (default: the previous calendar day).
 */
export async function getMovement(
    window_id: string,
    date: string,
    baseDate?: string,
): Promise<MovementResult> {
    const base_date = baseDate ?? new Date(new Date(`${date}T00:00:00Z`).getTime() - 86_400_000)
        .toISOString().slice(0, 10);

    // DISTINCT ON picks the highest slot per university — the latest sample
    // on the target day, and the closing sample on the baseline day.
    const latestFor = (param: string) => `
        SELECT DISTINCT ON (s.university_id)
               s.university_id, s.slot, s.strength, s.fully_paid, s.partially_paid,
               s.yet_to_pay, s.total_payable, s.total_paid
          FROM fee_collection_sample s
         WHERE s.window_id = $1 AND s.ist_date = ${param}::date
         ORDER BY s.university_id, s.slot DESC`;

    const [nowRes, baseRes, seriesRes, namesRes] = await Promise.all([
        db.query(latestFor('$2'), [window_id, date]),
        db.query(latestFor('$2'), [window_id, base_date]),
        db.query(
            `SELECT slot, SUM(total_paid) AS paid, SUM(fully_paid)::int AS fully
               FROM fee_collection_sample
              WHERE window_id = $1 AND ist_date = $2::date
              GROUP BY slot ORDER BY slot`,
            [window_id, date],
        ),
        db.query(
            `SELECT u.id, COALESCE(u.short_name, u.name) AS name
               FROM universities u
              WHERE u.id IN (
                  SELECT DISTINCT university_id FROM fee_collection_sample
                   WHERE window_id = $1 AND ist_date IN ($2::date, $3::date))`,
            [window_id, date, base_date],
        ),
    ]);

    const names = new Map((namesRes.rows as any[]).map(r => [r.id, r.name]));
    const base = new Map((baseRes.rows as any[]).map(r => [r.university_id, r]));

    const universities: MovementRow[] = (nowRes.rows as any[]).map(r => {
        const b = base.get(r.university_id);
        const base_fully = b ? n(b.fully_paid) : null;
        const base_paid = b ? n(b.total_paid) : null;
        return {
            university_id: r.university_id,
            university_name: names.get(r.university_id) ?? '—',
            base_fully, base_paid,
            now_strength: n(r.strength),
            now_fully: n(r.fully_paid),
            now_partial: n(r.partially_paid),
            now_yet: n(r.yet_to_pay),
            now_payable: n(r.total_payable),
            now_paid: n(r.total_paid),
            delta_fully: base_fully === null ? null : n(r.fully_paid) - base_fully,
            delta_paid: base_paid === null ? null : n(r.total_paid) - base_paid,
        };
    })
    // Biggest money movement first — that's the question people open this to answer.
    .sort((a, b) => (b.delta_paid ?? -Infinity) - (a.delta_paid ?? -Infinity));

    const baseline_missing = baseRes.rows.length === 0;
    const totals = universities.reduce((acc, u) => ({
        base_fully: baseline_missing ? null : (acc.base_fully ?? 0) + (u.base_fully ?? 0),
        base_paid:  baseline_missing ? null : (acc.base_paid  ?? 0) + (u.base_paid  ?? 0),
        now_strength: acc.now_strength + u.now_strength,
        now_fully: acc.now_fully + u.now_fully,
        now_partial: acc.now_partial + u.now_partial,
        now_yet: acc.now_yet + u.now_yet,
        now_payable: acc.now_payable + u.now_payable,
        now_paid: acc.now_paid + u.now_paid,
        delta_fully: baseline_missing ? null : (acc.delta_fully ?? 0) + (u.delta_fully ?? 0),
        delta_paid:  baseline_missing ? null : (acc.delta_paid  ?? 0) + (u.delta_paid  ?? 0),
    }), {
        base_fully: 0 as number | null, base_paid: 0 as number | null,
        now_strength: 0, now_fully: 0, now_partial: 0, now_yet: 0,
        now_payable: 0, now_paid: 0,
        delta_fully: 0 as number | null, delta_paid: 0 as number | null,
    });

    const nowSlot = (nowRes.rows as any[]).reduce((m, r) => Math.max(m, n(r.slot)), -1);
    const baseSlot = (baseRes.rows as any[]).reduce((m, r) => Math.max(m, n(r.slot)), -1);
    const istNow = istSlotNow();

    return {
        date, base_date, is_today: date === istNow.ist_date,
        latest_slot_label: nowSlot >= 0 ? slotLabel(nowSlot) : null,
        base_slot_label: baseSlot >= 0 ? slotLabel(baseSlot) : null,
        baseline_missing,
        universities, totals,
        series: (seriesRes.rows as any[]).map(r => ({
            slot: n(r.slot), label: slotLabel(n(r.slot)),
            paid: n(r.paid), fully: n(r.fully),
        })),
    };
}

/** Dates we hold samples for, newest first — drives the date pickers. */
export async function getSampledDates(window_id: string, limit = 60): Promise<string[]> {
    const r = await db.query(
        `SELECT DISTINCT ist_date::text AS d FROM fee_collection_sample
          WHERE window_id = $1 ORDER BY d DESC LIMIT $2`,
        [window_id, limit],
    );
    return (r.rows as any[]).map(x => x.d);
}
