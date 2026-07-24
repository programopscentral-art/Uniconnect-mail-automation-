/**
 * Fee Collection v2 — server load.
 *
 * Loads the list of active fee_semester_windows and (if one is picked)
 * its overview + batches in one round-trip so the page renders fully
 * populated.
 */
import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '@uniconnect/shared';
import { checkFeeAccess } from '$lib/server/fee_access';

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw redirect(302, '/login');
    checkFeeAccess(locals, 'view');

    const windowsRes = await db.query<{
        id: string; name: string; sheet_id: string; status: string;
        batch_subsheets: string; dates_subsheet: string | null;
        dropout_subsheet: string | null;
        auto_sync_enabled: boolean; auto_sync_interval_minutes: number;
        last_synced_at: string | null; last_sync_error: string | null;
    }>(
        `SELECT id, name, sheet_id, status, batch_subsheets, dates_subsheet, dropout_subsheet,
                auto_sync_enabled, auto_sync_interval_minutes,
                last_synced_at::text AS last_synced_at, last_sync_error
           FROM fee_semester_window
          WHERE status = 'active'
          ORDER BY created_at DESC`,
    );
    const windows = windowsRes.rows;

    const wantedWindowId = url.searchParams.get('window') || windows[0]?.id || '';
    const activeWindow = windows.find(w => w.id === wantedWindowId) || windows[0] || null;

    let batches: Array<{ id: string; batch_start_year: number; semester_number: number; display_name: string; subsheet_name: string; student_count: number; }> = [];
    let overview: any = null;
    let snapshotHistoryRows: Array<{ kind: string; fire_count: number; recipient_count: number; last_at: string | null }> = [];
    if (activeWindow) {
        const batchesRes = await db.query<{
            id: string; batch_start_year: number; semester_number: number;
            display_name: string; subsheet_name: string; student_count: number;
        }>(
            `SELECT id, batch_start_year, semester_number, display_name, subsheet_name, student_count
               FROM fee_batch_period
              WHERE window_id = $1
              ORDER BY batch_start_year DESC`,
            [activeWindow.id],
        );
        batches = batchesRes.rows;

        // Inline overview query (same shape as /api/fees2/windows/:id/overview)
        const perBatch = await db.query(
            `SELECT bp.id, bp.batch_start_year, bp.semester_number, bp.display_name,
                    COUNT(fsp.id)::int                                            AS total,
                    COUNT(*) FILTER (WHERE fsp.status = 'Fully Paid')::int       AS fully_paid,
                    COUNT(*) FILTER (WHERE fsp.status = 'Partially Paid')::int   AS partial,
                    COUNT(*) FILTER (WHERE fsp.status = 'Yet To Pay')::int       AS yet_to_pay,
                    COUNT(*) FILTER (WHERE fsp.tag_case = 'Dropout')::int        AS dropouts,
                    COALESCE(SUM(fsp.payable), 0)                                 AS total_payable,
                    COALESCE(SUM(fsp.paid), 0)                                    AS total_paid,
                    COALESCE(SUM(fsp.paid) FILTER (WHERE fsp.status = 'Fully Paid'), 0)     AS paid_from_fully,
                    COALESCE(SUM(fsp.paid) FILTER (WHERE fsp.status = 'Partially Paid'), 0) AS paid_from_partial
               FROM fee_batch_period bp
               LEFT JOIN fee_student_payments fsp ON fsp.batch_period_id = bp.id
              WHERE bp.window_id = $1
              GROUP BY bp.id
              ORDER BY bp.batch_start_year DESC`,
            [activeWindow.id],
        );
        const tagCounts = await db.query(
            `SELECT fsp.tag_case, COUNT(*)::int AS c
               FROM fee_student_payments fsp
               JOIN fee_batch_period bp ON bp.id = fsp.batch_period_id
              WHERE bp.window_id = $1 AND fsp.tag_case IS NOT NULL
              GROUP BY fsp.tag_case ORDER BY c DESC`,
            [activeWindow.id],
        );
        const coaches = await db.query(
            `SELECT fsp.success_coach_name AS coach,
                    COUNT(*)::int                                              AS total,
                    COUNT(*) FILTER (WHERE fsp.status = 'Fully Paid')::int    AS fully_paid,
                    COUNT(*) FILTER (WHERE fsp.status = 'Partially Paid')::int AS partial,
                    COUNT(*) FILTER (WHERE fsp.status = 'Yet To Pay')::int    AS yet_to_pay,
                    COALESCE(SUM(fsp.payable), 0)                              AS total_payable,
                    COALESCE(SUM(fsp.paid), 0)                                 AS total_paid
               FROM fee_student_payments fsp
               JOIN fee_batch_period bp ON bp.id = fsp.batch_period_id
              WHERE bp.window_id = $1 AND COALESCE(fsp.success_coach_name, '') <> ''
              GROUP BY fsp.success_coach_name ORDER BY total DESC LIMIT 50`,
            [activeWindow.id],
        );

        // Weekly trend snapshots for the collection-% chart. Pulls every
        // snapshot in the last 90 days; older "weekly estimated" points
        // backfilled by the seed script + recent daily real captures.
        const trend = await db.query(
            `SELECT snapshot_date::text AS d,
                    students, fully_paid, partial, yet_to_pay,
                    total_payable::text AS total_payable,
                    total_paid::text AS total_paid,
                    collection_pct_x100 AS pct,
                    is_estimated
               FROM fee_collection_snapshot
              WHERE window_id = $1
                AND snapshot_date >= (CURRENT_DATE - INTERVAL '90 days')::date
              ORDER BY snapshot_date ASC`,
            [activeWindow.id],
        );
        const perUniversity = await db.query(
            `SELECT u.id, u.name,
                    COUNT(fsp.id)::int                                          AS total,
                    COUNT(*) FILTER (WHERE fsp.status = 'Fully Paid')::int     AS fully_paid,
                    COUNT(*) FILTER (WHERE fsp.status = 'Partially Paid')::int AS partial,
                    COUNT(*) FILTER (WHERE fsp.status = 'Yet To Pay')::int     AS yet_to_pay,
                    COALESCE(SUM(fsp.payable), 0)                               AS total_payable,
                    COALESCE(SUM(fsp.paid), 0)                                  AS total_paid
               FROM fee_student_payments fsp
               JOIN fee_batch_period bp ON bp.id = fsp.batch_period_id
               JOIN universities u ON u.id = fsp.university_id
              WHERE bp.window_id = $1
              GROUP BY u.id
              ORDER BY total_payable DESC
              LIMIT 50`,
            [activeWindow.id],
        );

        const dates = await db.query(
            `SELECT DISTINCT ON (fum.university_id)
                    u.id AS university_id, u.name AS university_name,
                    fum.fee_per_student, fum.sem_last_date,
                    fum.collection_start_date, fum.collection_end_date,
                    fum.next_sem_start_date, fum.meta_remarks
               FROM fee_university_meta fum
               JOIN fee_batch_period bp ON bp.id = fum.batch_period_id
               JOIN universities u ON u.id = fum.university_id
              WHERE bp.window_id = $1
              ORDER BY fum.university_id, fum.updated_at DESC`,
            [activeWindow.id],
        );

        // Per-(batch, university) breakdown so the Overview's batch multi-select
        // can recompute per-university summaries for just the selected batches
        // client-side (no extra round-trip on toggle).
        const perBatchUni = await db.query(
            `SELECT fsp.batch_period_id, bp.batch_start_year,
                    u.id AS university_id, u.name AS university_name,
                    COUNT(fsp.id)::int                                          AS total,
                    COUNT(*) FILTER (WHERE fsp.status = 'Fully Paid')::int     AS fully_paid,
                    COUNT(*) FILTER (WHERE fsp.status = 'Partially Paid')::int AS partial,
                    COUNT(*) FILTER (WHERE fsp.status = 'Yet To Pay')::int     AS yet_to_pay,
                    COALESCE(SUM(fsp.payable), 0)                               AS total_payable,
                    COALESCE(SUM(fsp.paid), 0)                                  AS total_paid
               FROM fee_student_payments fsp
               JOIN fee_batch_period bp ON bp.id = fsp.batch_period_id
               JOIN universities u ON u.id = fsp.university_id
              WHERE bp.window_id = $1
              GROUP BY fsp.batch_period_id, bp.batch_start_year, u.id, u.name`,
            [activeWindow.id],
        );

        // Dropout count comes from the dropout sub-sheet directly, NOT from
        // tag_case = 'Dropout'. Reason: tag_case only gets set when we can
        // link a dropout row to a batch_period (matching UIDs), which fails
        // for any student in the dropout sheet who isn't in any batch sheet
        // (graduated, transferred, sheet drift, etc.). The raw dropout count
        // is the authoritative number.
        const dropoutsR = await db.query(
            `SELECT COUNT(*)::int AS n FROM fee_dropout_log WHERE window_id = $1`,
            [activeWindow.id],
        );
        const dropoutsTotal = Number(dropoutsR.rows[0]?.n ?? 0);

        const dropoutReasonsR = await db.query(
            `SELECT COALESCE(NULLIF(TRIM(reason), ''), '(no reason given)') AS reason,
                    COUNT(*)::int AS c
               FROM fee_dropout_log
              WHERE window_id = $1
              GROUP BY 1 ORDER BY c DESC LIMIT 8`,
            [activeWindow.id],
        );

        let students = 0, fully = 0, partial = 0, yet = 0;
        let totalPayable = 0, totalPaid = 0, paidFromFully = 0, paidFromPartial = 0;
        for (const b of perBatch.rows) {
            students += Number(b.total); fully += Number(b.fully_paid);
            partial += Number(b.partial); yet += Number(b.yet_to_pay);
            totalPayable += Number(b.total_payable); totalPaid += Number(b.total_paid);
            paidFromFully += Number(b.paid_from_fully); paidFromPartial += Number(b.paid_from_partial);
        }
        const dropouts = dropoutsTotal;
        const collectionPct = totalPayable > 0 ? Math.round((totalPaid / totalPayable) * 100) : 0;

        // Snapshot-fire history for this window. notifications.source_id is
        // `fee_${kind}_${window_id}_${ist_date}_${email}` (the doubled "fee_"
        // happens because the kind value already starts with "fee_snapshot_"
        // — harmless). The IST date is parseable from the source_id; we
        // count it via SPLIT_PART so we know "number of fires" vs "number of
        // recipient rows". For our schema:
        //   parts split by '_': ['fee', 'fee', 'snapshot', kind_word, uuid,
        //                        ist_date (YYYY-MM-DD), email...]
        // (UUIDs contain hyphens, not underscores, so the whole uuid is one
        // part.) Index 6 (1-indexed in Postgres) is the IST date.
        const snapshotHistory = await db.query(
            `SELECT
                CASE
                  WHEN source_id LIKE 'fee_fee_snapshot_morning_%' THEN 'morning'
                  WHEN source_id LIKE 'fee_fee_snapshot_evening_%' THEN 'evening'
                  WHEN source_id LIKE 'fee_fee_snapshot_manual_%'  THEN 'manual'
                  ELSE 'other'
                END AS kind,
                COUNT(DISTINCT SPLIT_PART(source_id, '_', 6))::int AS fire_count,
                COUNT(*)::int AS recipient_count,
                MAX(created_at)::text AS last_at
              FROM notifications
             WHERE source_id LIKE 'fee_fee_snapshot_%'
               AND source_id LIKE '%' || $1 || '%'
               AND created_at > NOW() - INTERVAL '30 days'
             GROUP BY 1
             ORDER BY last_at DESC NULLS LAST`,
            [activeWindow.id],
        );
        snapshotHistoryRows = snapshotHistory.rows;

        overview = {
            totals: { students, fully_paid: fully, partial, yet_to_pay: yet, dropouts,
                      total_payable: totalPayable, total_paid: totalPaid, collection_pct: collectionPct,
                      paid_from_fully: paidFromFully, paid_from_partial: paidFromPartial },
            per_batch: perBatch.rows,
            tag_counts: tagCounts.rows,
            success_coaches: coaches.rows,
            university_dates: dates.rows,
            per_university: perUniversity.rows,
            per_batch_university: perBatchUni.rows,
            dropout_reasons: dropoutReasonsR.rows,
            trend: trend.rows,
        };
    }

    return {
        windows,
        activeWindow,
        batches,
        overview,
        snapshotHistory: snapshotHistoryRows,
        role: locals.user.role,
        userIsAdmin: locals.user.role === 'ADMIN' || locals.user.role === 'PROGRAM_OPS',
    };
};
