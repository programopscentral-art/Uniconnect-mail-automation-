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
                    COUNT(*) FILTER (WHERE fsp.status = 'Yet To Pay')::int    AS yet_to_pay
               FROM fee_student_payments fsp
               JOIN fee_batch_period bp ON bp.id = fsp.batch_period_id
              WHERE bp.window_id = $1 AND COALESCE(fsp.success_coach_name, '') <> ''
              GROUP BY fsp.success_coach_name ORDER BY total DESC LIMIT 50`,
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

        let students = 0, fully = 0, partial = 0, yet = 0, dropouts = 0;
        let totalPayable = 0, totalPaid = 0, paidFromFully = 0, paidFromPartial = 0;
        for (const b of perBatch.rows) {
            students += Number(b.total); fully += Number(b.fully_paid);
            partial += Number(b.partial); yet += Number(b.yet_to_pay);
            dropouts += Number(b.dropouts);
            totalPayable += Number(b.total_payable); totalPaid += Number(b.total_paid);
            paidFromFully += Number(b.paid_from_fully); paidFromPartial += Number(b.paid_from_partial);
        }
        const collectionPct = totalPayable > 0 ? Math.round((totalPaid / totalPayable) * 100) : 0;

        overview = {
            totals: { students, fully_paid: fully, partial, yet_to_pay: yet, dropouts,
                      total_payable: totalPayable, total_paid: totalPaid, collection_pct: collectionPct,
                      paid_from_fully: paidFromFully, paid_from_partial: paidFromPartial },
            per_batch: perBatch.rows,
            tag_counts: tagCounts.rows,
            success_coaches: coaches.rows,
            university_dates: dates.rows,
        };
    }

    return {
        windows,
        activeWindow,
        batches,
        overview,
        role: locals.user.role,
        userIsAdmin: locals.user.role === 'ADMIN' || locals.user.role === 'PROGRAM_OPS',
    };
};
