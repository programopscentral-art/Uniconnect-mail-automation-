/**
 * GET /api/fees2/windows/[id]/dropouts?batch_period_id=
 *   → dropout list for the window, optionally scoped to one batch.
 *     Joins university + batch_period for display, falls back gracefully
 *     when batch_period_id wasn't matched (dropout sheet had a user the
 *     window's batches didn't carry).
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '@uniconnect/shared';
import { checkFeeAccess } from '$lib/server/fee_access';

export const GET: RequestHandler = async ({ params, locals, url }) => {
    checkFeeAccess(locals, 'view');
    if (!params.id) throw error(400, 'id required');
    const batchPeriodId = url.searchParams.get('batch_period_id') || '';

    const args: unknown[] = [params.id];
    const conds = ['fdl.window_id = $1'];
    if (batchPeriodId) { args.push(batchPeriodId); conds.push(`fdl.batch_period_id = $${args.length}`); }

    const r = await db.query(
        `SELECT fdl.id, fdl.zoho_user_id, fdl.student_name, fdl.dropped_at::text AS dropped_at,
                fdl.reason, fdl.imported_at::text AS imported_at,
                fdl.batch_period_id, bp.display_name AS batch_name,
                bp.batch_start_year, bp.semester_number,
                fdl.university_id, u.name AS university_name
           FROM fee_dropout_log fdl
           LEFT JOIN fee_batch_period bp ON bp.id = fdl.batch_period_id
           LEFT JOIN universities u ON u.id = fdl.university_id
          WHERE ${conds.join(' AND ')}
          ORDER BY COALESCE(fdl.dropped_at, fdl.imported_at::date) DESC, fdl.student_name`,
        args,
    );
    return json({ dropouts: r.rows });
};
