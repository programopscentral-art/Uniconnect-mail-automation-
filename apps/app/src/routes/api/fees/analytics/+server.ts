/**
 * JSON API for fee analytics data. Used by /fee-collection/analytics page.
 */
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import {
    getFeeOverallSummary,
    getFeeUniversityRollup,
    getActiveFeePeriod,
    db,
} from '@uniconnect/shared';
import { checkFeeAccess } from '$lib/server/fee_access';

export const GET: RequestHandler = async ({ url, locals }) => {
    checkFeeAccess(locals, 'view');

    let periodId = url.searchParams.get('period_id') || '';
    if (!periodId) {
        const active = await getActiveFeePeriod();
        if (!active) throw error(404, 'No active fee period');
        periodId = active.id;
    }

    const [summary, byUniv, tagCounts, periodInfo] = await Promise.all([
        getFeeOverallSummary(periodId),
        getFeeUniversityRollup(periodId),
        db.query(
            `SELECT tag, COUNT(*)::int AS count
             FROM fee_student_tags t
             JOIN fee_student_payments sp ON sp.id = t.student_payment_id
             WHERE sp.period_id = $1
             GROUP BY tag ORDER BY count DESC`,
            [periodId]
        ),
        db.query(`SELECT name, batch_start_year, batch_end_year, term FROM fee_periods WHERE id = $1`, [periodId]),
    ]);

    return json({
        period: periodInfo.rows[0] || { name: 'Active Period' },
        summary,
        byUniv,
        tagCounts: tagCounts.rows,
    });
};
