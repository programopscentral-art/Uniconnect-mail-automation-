/**
 * JSON API for fee analytics data. Used by /fee-collection/analytics page.
 *
 * Query params:
 *   period_id      — required (or active period used)
 *   range          — '7d' | '30d' | '90d' | 'all' (default '30d') for trend window
 *   university_id  — optional, restricts trend + status mix to one uni
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

function rangeToInterval(range: string | null): string | null {
    switch (range) {
        case '7d': return '7 days';
        case '30d': return '30 days';
        case '90d': return '90 days';
        case 'all': return null;
        default: return '30 days';
    }
}

export const GET: RequestHandler = async ({ url, locals }) => {
    checkFeeAccess(locals, 'view');

    let periodId = url.searchParams.get('period_id') || '';
    if (!periodId) {
        const active = await getActiveFeePeriod();
        if (!active) throw error(404, 'No active fee period');
        periodId = active.id;
    }
    const range = url.searchParams.get('range');
    const interval = rangeToInterval(range);
    const universityId = url.searchParams.get('university_id') || null;

    // Trend WHERE: period + optional range + optional uni
    const trendConditions: string[] = [`t.period_id = $1`];
    const trendParams: any[] = [periodId];
    let i = 2;
    if (interval) {
        trendConditions.push(`t.payment_date >= (CURRENT_DATE - $${i++}::interval)`);
        trendParams.push(interval);
    }
    if (universityId) {
        trendConditions.push(`t.university_id = $${i++}`);
        trendParams.push(universityId);
    }
    const trendWhere = trendConditions.join(' AND ');

    // Build status/tag uni filter — separate param set so injection-safe
    const uniFilterParams: any[] = [periodId];
    let uniFilterSql = '';
    if (universityId) {
        uniFilterSql = ' AND sp.university_id = $2';
        uniFilterParams.push(universityId);
    }

    const [summary, byUniv, tagCountsRes, periodInfo, dailyTrend, monthlyTrend, statusMix] = await Promise.all([
        getFeeOverallSummary(periodId),
        getFeeUniversityRollup(periodId),
        db.query(
            `SELECT tag, COUNT(*)::int AS count
             FROM fee_student_tags t
             JOIN fee_student_payments sp ON sp.id = t.student_payment_id
             WHERE sp.period_id = $1${uniFilterSql}
             GROUP BY tag ORDER BY count DESC`,
            uniFilterParams
        ),
        db.query(`SELECT name, batch_start_year, batch_end_year, term FROM fee_periods WHERE id = $1`, [periodId]),
        db.query(
            `SELECT t.payment_date::text AS date,
                    COALESCE(SUM(t.amount), 0)::bigint AS amount,
                    COUNT(DISTINCT t.zoho_user_id)::int AS students
             FROM fee_payment_transactions t
             WHERE ${trendWhere}
             GROUP BY t.payment_date
             ORDER BY t.payment_date`,
            trendParams
        ),
        db.query(
            `SELECT to_char(t.payment_date, 'YYYY-MM') AS month,
                    COALESCE(SUM(t.amount), 0)::bigint AS amount,
                    COUNT(DISTINCT t.zoho_user_id)::int AS students
             FROM fee_payment_transactions t
             WHERE t.period_id = $1${universityId ? ' AND t.university_id = $2' : ''}
             GROUP BY to_char(t.payment_date, 'YYYY-MM')
             ORDER BY month`,
            universityId ? [periodId, universityId] : [periodId]
        ),
        db.query(
            `SELECT sp.status, COUNT(*)::int AS count
             FROM fee_student_payments sp
             WHERE sp.period_id = $1${uniFilterSql}
             GROUP BY sp.status`,
            uniFilterParams
        ),
    ]);

    return json({
        period: periodInfo.rows[0] || { name: 'Active Period' },
        summary,
        byUniv,
        tagCounts: tagCountsRes.rows,
        dailyTrend: dailyTrend.rows,
        monthlyTrend: monthlyTrend.rows,
        statusMix: statusMix.rows,
        range: range || '30d',
        universityId,
    });
};
