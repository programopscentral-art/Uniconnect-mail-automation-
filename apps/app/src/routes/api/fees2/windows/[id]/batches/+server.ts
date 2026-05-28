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
                -- live counts in case student_count snapshot is stale
                COALESCE(stats.total, 0)::int       AS live_total,
                COALESCE(stats.fully_paid, 0)::int  AS live_fully_paid,
                COALESCE(stats.partial, 0)::int     AS live_partial,
                COALESCE(stats.yet_to_pay, 0)::int  AS live_yet_to_pay,
                COALESCE(stats.dropouts, 0)::int    AS live_dropouts,
                COALESCE(stats.total_payable, 0)    AS live_total_payable,
                COALESCE(stats.total_paid, 0)       AS live_total_paid
           FROM fee_batch_period bp
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
