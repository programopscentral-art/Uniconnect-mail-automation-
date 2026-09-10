/**
 * GET /api/fees2/windows/:id/movement?date=YYYY-MM-DD&base=YYYY-MM-DD
 *   → day-over-day movement: the latest sample on `date` compared against the
 *     closing sample of `base` (default: the previous calendar day), plus the
 *     intraday series for `date`.
 *
 * Both dates are optional; omitting them gives "today vs yesterday's close",
 * which is what the Daily tab opens on.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkFeeAccess } from '$lib/server/fee_access';
import { todayInIST } from '$lib/server/fee_access';
import { getMovement, getSampledDates } from '$lib/server/fee_samples';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const GET: RequestHandler = async ({ params, url, locals }) => {
    checkFeeAccess(locals, 'view');
    if (!params.id) throw error(400, 'id required');

    const date = url.searchParams.get('date') || todayInIST();
    const base = url.searchParams.get('base') || undefined;
    if (!DATE_RE.test(date)) throw error(400, 'date must be YYYY-MM-DD');
    if (base && !DATE_RE.test(base)) throw error(400, 'base must be YYYY-MM-DD');

    const [movement, dates] = await Promise.all([
        getMovement(params.id, date, base),
        getSampledDates(params.id),
    ]);
    return json({ ...movement, available_dates: dates });
};
