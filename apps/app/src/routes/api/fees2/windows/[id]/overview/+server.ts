/**
 * GET /api/fees2/windows/:id/overview
 *   → Collection Overview aggregates for one semester window:
 *     - per-batch totals (students, payable, paid, fully/partial/yet/dropout)
 *     - tag-case counts across the window
 *     - success-coach roll-up (fully paid / partial / yet-to-pay students per coach)
 *     - per-university dates from fee_university_meta (any batch_period row works
 *       since the dates sub-sheet is shared across batches in the window)
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '@uniconnect/shared';
import { checkFeeAccess } from '$lib/server/fee_access';

export const GET: RequestHandler = async ({ params, locals }) => {
    checkFeeAccess(locals, 'view');
    if (!params.id) throw error(400, 'id required');

    // Per-batch totals
    const perBatch = await db.query(
        `SELECT bp.id, bp.batch_start_year, bp.semester_number, bp.display_name,
                COUNT(fsp.id)                                                AS total,
                COUNT(*) FILTER (WHERE fsp.status = 'Fully Paid')           AS fully_paid,
                COUNT(*) FILTER (WHERE fsp.status = 'Partially Paid')       AS partial,
                COUNT(*) FILTER (WHERE fsp.status = 'Yet To Pay')           AS yet_to_pay,
                COUNT(*) FILTER (WHERE fsp.tag_case = 'Dropout')            AS dropouts,
                COALESCE(SUM(fsp.payable), 0)                                AS total_payable,
                COALESCE(SUM(fsp.paid), 0)                                   AS total_paid
           FROM fee_batch_period bp
           LEFT JOIN fee_student_payments fsp ON fsp.batch_period_id = bp.id
          WHERE bp.window_id = $1
          GROUP BY bp.id
          ORDER BY bp.batch_start_year DESC`,
        [params.id],
    );

    // Tag-case counts across the window
    const tagCounts = await db.query(
        `SELECT fsp.tag_case, COUNT(*)::int AS c
           FROM fee_student_payments fsp
           JOIN fee_batch_period bp ON bp.id = fsp.batch_period_id
          WHERE bp.window_id = $1
            AND fsp.tag_case IS NOT NULL
          GROUP BY fsp.tag_case
          ORDER BY c DESC`,
        [params.id],
    );

    // Success-coach roll-up
    const coaches = await db.query(
        `SELECT fsp.success_coach_name AS coach,
                COUNT(*)                                              AS total,
                COUNT(*) FILTER (WHERE fsp.status = 'Fully Paid')    AS fully_paid,
                COUNT(*) FILTER (WHERE fsp.status = 'Partially Paid') AS partial,
                COUNT(*) FILTER (WHERE fsp.status = 'Yet To Pay')    AS yet_to_pay
           FROM fee_student_payments fsp
           JOIN fee_batch_period bp ON bp.id = fsp.batch_period_id
          WHERE bp.window_id = $1
            AND COALESCE(fsp.success_coach_name, '') <> ''
          GROUP BY fsp.success_coach_name
          ORDER BY total DESC`,
        [params.id],
    );

    // Per-university dates — pull from any one batch_period since the dates
    // sub-sheet is shared across all batches in the window.
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
        [params.id],
    );

    // Window-wide totals derived from per-batch
    let totalStudents = 0, totalFully = 0, totalPartial = 0, totalYet = 0;
    let totalDropouts = 0, totalPayable = 0, totalPaid = 0;
    for (const b of perBatch.rows) {
        totalStudents += Number(b.total);
        totalFully    += Number(b.fully_paid);
        totalPartial  += Number(b.partial);
        totalYet      += Number(b.yet_to_pay);
        totalDropouts += Number(b.dropouts);
        totalPayable  += Number(b.total_payable);
        totalPaid     += Number(b.total_paid);
    }
    const collectionPct = totalPayable > 0 ? Math.round((totalPaid / totalPayable) * 100) : 0;

    return json({
        totals: {
            students: totalStudents,
            fully_paid: totalFully,
            partially_paid: totalPartial,
            yet_to_pay: totalYet,
            dropouts: totalDropouts,
            total_payable: totalPayable,
            total_paid: totalPaid,
            collection_pct: collectionPct,
        },
        per_batch: perBatch.rows,
        tag_counts: tagCounts.rows,
        success_coaches: coaches.rows,
        university_dates: dates.rows,
    });
};
