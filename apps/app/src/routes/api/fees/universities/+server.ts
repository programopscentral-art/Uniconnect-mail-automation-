import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getFeeUniversityRollup, getFeeOverallSummary, upsertFeeUniversityMeta, mergeUniversities } from '@uniconnect/shared';
import { checkFeeAccess } from '$lib/server/fee_access';

export const GET: RequestHandler = async ({ url, locals }) => {
    checkFeeAccess(locals, 'view');
    const periodId = url.searchParams.get('period_id');
    if (!periodId) throw error(400, 'period_id required');

    const [universities, summary] = await Promise.all([
        getFeeUniversityRollup(periodId),
        getFeeOverallSummary(periodId)
    ]);
    return json({ universities, summary });
};

export const POST: RequestHandler = async ({ request, locals }) => {
    checkFeeAccess(locals, 'edit_payments');
    const body = await request.json();
    if (!body.period_id || !body.university_id) throw error(400, 'period_id and university_id required');
    const meta = await upsertFeeUniversityMeta(body);
    return json(meta);
};

/**
 * Merge duplicate universities: moves all fee data from `source_id` into
 * `target_id`, then deletes the source row. Admin only.
 *
 * Example: POST /api/fees/universities/merge { source_id, target_id }
 */
export const PATCH: RequestHandler = async ({ request, locals }) => {
    checkFeeAccess(locals, 'admin');
    const body = await request.json();
    if (body.action !== 'merge') throw error(400, 'action must be "merge"');
    if (!body.source_id || !body.target_id) throw error(400, 'source_id and target_id required');
    const result = await mergeUniversities(body.source_id, body.target_id);
    return json({ ok: true, ...result });
};
