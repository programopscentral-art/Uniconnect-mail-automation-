/**
 * Fee Collection v2 — Overview aggregates.
 *
 * The Overview used to be built purely by aggregating fee_student_payments.
 * That silently stopped matching the source sheet, for two compounding
 * reasons:
 *
 *  1. Only three of the twenty university rows on the sheet's roll-up tab
 *     still have a per-student sub-sheet behind them (ADYPU, KKH Batch-1,
 *     KKH Batch-2). The other seventeen are maintained as roll-up rows only.
 *     Their per-student rows in our DB are whatever the last successful
 *     import left behind and drift further from the sheet every day.
 *
 *  2. Because the sheet's per-student tab shrank to one university, the
 *     importer's purge guard (don't delete when the sheet returns <50% of
 *     what's in the DB) correctly refused to clean up — freezing 6,111 rows
 *     in place with no visible warning.
 *
 * So: fee_university_summary — ingested verbatim from the sheet's roll-up tab
 * — is authoritative for any (batch, university) it covers. Per-student
 * aggregation fills the gaps and still powers the Students tab, tags and
 * remarks. Each row reports its `source` so the UI can be honest about which
 * numbers are live and which are a stale student-level estimate.
 */
import { db } from '@uniconnect/shared';

export type RowSource = 'sheet' | 'students';

export interface PerBatchUniRow {
    batch_period_id: string;
    batch_start_year: number;
    university_id: string;
    university_name: string;
    total: number;
    fully_paid: number;
    partial: number;
    yet_to_pay: number;
    total_payable: number;
    total_paid: number;
    source: RowSource;
    /** Students we hold row-level detail for — 0 means the Students tab is empty for this university. */
    student_rows: number;
    /** ISO timestamp of the newest student row we hold, null when we hold none. */
    students_imported_at: string | null;
}

export interface PerBatchRow {
    id: string;
    batch_start_year: number;
    semester_number: number;
    display_name: string;
    total: number;
    fully_paid: number;
    partial: number;
    yet_to_pay: number;
    dropouts: number;
    total_payable: number;
    total_paid: number;
    paid_from_fully: number;
    paid_from_partial: number;
    source: RowSource | 'mixed';
}

export interface PerUniRow {
    id: string;
    name: string;
    total: number;
    fully_paid: number;
    partial: number;
    yet_to_pay: number;
    total_payable: number;
    total_paid: number;
    source: RowSource | 'mixed';
}

export interface OverviewAggregates {
    per_batch: PerBatchRow[];
    per_batch_university: PerBatchUniRow[];
    per_university: PerUniRow[];
    /** How many (batch, university) cells came from the sheet roll-up vs student rows. */
    provenance: { sheet: number; students: number; stale_student_universities: string[] };
}

const n = (v: unknown): number => Number(v ?? 0) || 0;

/**
 * @param universityIds  when given, restrict every aggregate to these
 *                       universities (a PM's scope). Undefined = whole org.
 */
export async function loadOverviewAggregates(
    windowId: string,
    universityIds?: string[],
): Promise<OverviewAggregates> {
    const scoped = Array.isArray(universityIds);
    const scopeArgs: unknown[] = scoped ? [universityIds] : [];
    const uniFilter = scoped ? ' AND u.id = ANY($2::uuid[])' : '';
    const sumFilter = scoped ? ' AND s.university_id = ANY($2::uuid[])' : '';
    const [batchesRes, studentsRes, sheetRes] = await Promise.all([
        db.query(
            `SELECT id, batch_start_year, semester_number, display_name
               FROM fee_batch_period
              WHERE window_id = $1
              ORDER BY batch_start_year DESC`,
            [windowId],
        ),
        db.query(
            `SELECT fsp.batch_period_id, u.id AS university_id, u.name AS university_name,
                    COUNT(fsp.id)::int                                          AS total,
                    COUNT(*) FILTER (WHERE fsp.status = 'Fully Paid')::int     AS fully_paid,
                    COUNT(*) FILTER (WHERE fsp.status = 'Partially Paid')::int AS partial,
                    COUNT(*) FILTER (WHERE fsp.status = 'Yet To Pay')::int     AS yet_to_pay,
                    COALESCE(SUM(fsp.payable), 0)                               AS total_payable,
                    COALESCE(SUM(fsp.paid), 0)                                  AS total_paid,
                    COALESCE(SUM(fsp.paid) FILTER (WHERE fsp.status = 'Fully Paid'), 0)     AS paid_from_fully,
                    COALESCE(SUM(fsp.paid) FILTER (WHERE fsp.status = 'Partially Paid'), 0) AS paid_from_partial,
                    MAX(fsp.imported_at)::text                                  AS imported_at
               FROM fee_student_payments fsp
               JOIN fee_batch_period bp ON bp.id = fsp.batch_period_id
               JOIN universities u ON u.id = fsp.university_id
              WHERE bp.window_id = $1${uniFilter}
              GROUP BY fsp.batch_period_id, u.id, u.name`,
            [windowId, ...scopeArgs],
        ),
        db.query(
            `SELECT s.batch_period_id, u.id AS university_id, u.name AS university_name,
                    s.strength, s.fully_paid, s.partially_paid, s.yet_to_pay,
                    s.total_payable, s.total_paid, s.dropout_count
               FROM fee_university_summary s
               JOIN universities u ON u.id = s.university_id
              WHERE s.window_id = $1${sumFilter}`,
            [windowId, ...scopeArgs],
        ),
    ]);

    const batches = batchesRes.rows as Array<{
        id: string; batch_start_year: number; semester_number: number; display_name: string;
    }>;
    const batchYear = new Map(batches.map(b => [b.id, b.batch_start_year]));

    const key = (bp: string | null, uni: string) => `${bp ?? 'none'}|${uni}`;

    // Student-level aggregation, keyed by (batch, university).
    type StudentAgg = {
        total: number; fully: number; partial: number; yet: number;
        payable: number; paid: number; paidFully: number; paidPartial: number;
        importedAt: string | null; name: string; universityId: string; batchId: string;
    };
    const students = new Map<string, StudentAgg>();
    for (const r of studentsRes.rows as any[]) {
        students.set(key(r.batch_period_id, r.university_id), {
            total: n(r.total), fully: n(r.fully_paid), partial: n(r.partial), yet: n(r.yet_to_pay),
            payable: n(r.total_payable), paid: n(r.total_paid),
            paidFully: n(r.paid_from_fully), paidPartial: n(r.paid_from_partial),
            importedAt: r.imported_at ?? null,
            name: r.university_name, universityId: r.university_id, batchId: r.batch_period_id,
        });
    }

    const merged: PerBatchUniRow[] = [];
    const usedKeys = new Set<string>();
    const staleUniversities = new Set<string>();

    // 1. Every cell the sheet roll-up covers — the sheet wins outright.
    for (const r of sheetRes.rows as any[]) {
        if (!r.batch_period_id) continue; // unmappable batch label; skip rather than double-count
        const k = key(r.batch_period_id, r.university_id);
        usedKeys.add(k);
        const st = students.get(k);
        merged.push({
            batch_period_id: r.batch_period_id,
            batch_start_year: batchYear.get(r.batch_period_id) ?? 0,
            university_id: r.university_id,
            university_name: r.university_name,
            total: n(r.strength),
            fully_paid: n(r.fully_paid),
            partial: n(r.partially_paid),
            yet_to_pay: n(r.yet_to_pay),
            total_payable: n(r.total_payable),
            total_paid: n(r.total_paid),
            source: 'sheet',
            student_rows: st?.total ?? 0,
            students_imported_at: st?.importedAt ?? null,
        });
        // Flag universities whose student detail no longer agrees with the
        // sheet — that detail is a frozen copy, not live data.
        if (st && (st.total !== n(r.strength) || st.paid !== n(r.total_paid))) {
            staleUniversities.add(r.university_name);
        }
    }

    // 2. Anything the roll-up doesn't cover still comes from student rows.
    for (const [k, st] of students) {
        if (usedKeys.has(k)) continue;
        merged.push({
            batch_period_id: st.batchId,
            batch_start_year: batchYear.get(st.batchId) ?? 0,
            university_id: st.universityId,
            university_name: st.name,
            total: st.total,
            fully_paid: st.fully,
            partial: st.partial,
            yet_to_pay: st.yet,
            total_payable: st.payable,
            total_paid: st.paid,
            source: 'students',
            student_rows: st.total,
            students_imported_at: st.importedAt,
        });
    }

    // Roll up to per-batch. The money split by status (paid_from_*) only
    // exists at student level — the roll-up tab doesn't carry it — so it stays
    // student-derived and is a breakdown hint, not an authoritative total.
    const per_batch: PerBatchRow[] = batches.map(b => {
        const cells = merged.filter(c => c.batch_period_id === b.id);
        const sources = new Set(cells.map(c => c.source));
        let paidFully = 0, paidPartial = 0;
        for (const [k, st] of students) {
            if (st.batchId !== b.id) continue;
            void k;
            paidFully += st.paidFully;
            paidPartial += st.paidPartial;
        }
        return {
            id: b.id,
            batch_start_year: b.batch_start_year,
            semester_number: b.semester_number,
            display_name: b.display_name,
            total: cells.reduce((a, c) => a + c.total, 0),
            fully_paid: cells.reduce((a, c) => a + c.fully_paid, 0),
            partial: cells.reduce((a, c) => a + c.partial, 0),
            yet_to_pay: cells.reduce((a, c) => a + c.yet_to_pay, 0),
            dropouts: 0, // filled by the caller from fee_dropout_log
            total_payable: cells.reduce((a, c) => a + c.total_payable, 0),
            total_paid: cells.reduce((a, c) => a + c.total_paid, 0),
            paid_from_fully: paidFully,
            paid_from_partial: paidPartial,
            source: sources.size === 1 ? ([...sources][0] as RowSource) : 'mixed',
        };
    });

    // Roll up to per-university across batches (KKH appears under two).
    const uniMap = new Map<string, PerUniRow & { sources: Set<RowSource> }>();
    for (const c of merged) {
        const cur = uniMap.get(c.university_id) ?? {
            id: c.university_id, name: c.university_name,
            total: 0, fully_paid: 0, partial: 0, yet_to_pay: 0,
            total_payable: 0, total_paid: 0, source: 'sheet' as const,
            sources: new Set<RowSource>(),
        };
        cur.total += c.total; cur.fully_paid += c.fully_paid;
        cur.partial += c.partial; cur.yet_to_pay += c.yet_to_pay;
        cur.total_payable += c.total_payable; cur.total_paid += c.total_paid;
        cur.sources.add(c.source);
        uniMap.set(c.university_id, cur);
    }
    const per_university: PerUniRow[] = Array.from(uniMap.values())
        .map(({ sources, ...r }) => ({ ...r, source: sources.size === 1 ? [...sources][0] : ('mixed' as const) }))
        .sort((a, b) => b.total_payable - a.total_payable);

    return {
        per_batch,
        per_batch_university: merged,
        per_university,
        provenance: {
            sheet: merged.filter(c => c.source === 'sheet').length,
            students: merged.filter(c => c.source === 'students').length,
            stale_student_universities: Array.from(staleUniversities).sort(),
        },
    };
}
