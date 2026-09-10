/**
 * GET /api/fees2/windows/:id/batches
 *   → all fee_batch_periods inside the window with student_count snapshots
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '@uniconnect/shared';
import { checkFeeAccess } from '$lib/server/fee_access';

export const GET: RequestHandler = async ({ params, locals }) => {
    checkFeeAccess(locals, 'view');
    if (!params.id) throw error(400, 'id required');
    const r = await db.query(
        `SELECT bp.id, bp.window_id, bp.batch_start_year, bp.semester_number,
                bp.subsheet_name, bp.display_name, bp.student_count,
                bp.last_synced_at,
                -- Live counts. The sheet's own per-university roll-up
                -- (fee_university_summary) wins when it covers this batch;
                -- only universities it doesn't cover fall back to counting
                -- our per-student rows, which for roll-up-only campuses are
                -- a frozen copy rather than today's numbers.
                COALESCE(NULLIF(roll.total, 0), stats.total, 0)::int              AS live_total,
                COALESCE(CASE WHEN roll.total > 0 THEN roll.fully_paid ELSE stats.fully_paid END, 0)::int AS live_fully_paid,
                COALESCE(CASE WHEN roll.total > 0 THEN roll.partial    ELSE stats.partial    END, 0)::int AS live_partial,
                COALESCE(CASE WHEN roll.total > 0 THEN roll.yet_to_pay ELSE stats.yet_to_pay END, 0)::int AS live_yet_to_pay,
                COALESCE(stats.dropouts, 0)::int    AS live_dropouts,
                COALESCE(CASE WHEN roll.total > 0 THEN roll.total_payable ELSE stats.total_payable END, 0) AS live_total_payable,
                COALESCE(CASE WHEN roll.total > 0 THEN roll.total_paid    ELSE stats.total_paid    END, 0) AS live_total_paid
           FROM fee_batch_period bp
           LEFT JOIN LATERAL (
                SELECT SUM(strength)::int       AS total,
                       SUM(fully_paid)::int     AS fully_paid,
                       SUM(partially_paid)::int AS partial,
                       SUM(yet_to_pay)::int     AS yet_to_pay,
                       SUM(total_payable)       AS total_payable,
                       SUM(total_paid)          AS total_paid
                  FROM fee_university_summary
                 WHERE batch_period_id = bp.id
           ) roll ON true
           LEFT JOIN LATERAL (
                SELECT
                    COUNT(*)                                                              AS total,
                    COUNT(*) FILTER (WHERE status = 'Fully Paid')                         AS fully_paid,
                    COUNT(*) FILTER (WHERE status = 'Partially Paid')                     AS partial,
                    COUNT(*) FILTER (WHERE status = 'Yet To Pay')                         AS yet_to_pay,
                    COUNT(*) FILTER (WHERE tag_case = 'Dropout')                          AS dropouts,
                    COALESCE(SUM(payable), 0)                                             AS total_payable,
                    COALESCE(SUM(paid), 0)                                                AS total_paid
                  FROM fee_student_payments
                 WHERE batch_period_id = bp.id
           ) stats ON true
          WHERE bp.window_id = $1
          ORDER BY bp.batch_start_year DESC`,
        [params.id],
    );
    return json({ batches: r.rows });
};
