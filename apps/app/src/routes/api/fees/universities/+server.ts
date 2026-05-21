import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getFeeUniversityRollup, getFeeOverallSummary, upsertFeeUniversityMeta, mergeUniversities } from '@uniconnect/shared';
import { checkFeeAccess } from '$lib/server/fee_access';
import { autoMergeAliasDuplicates } from '$lib/server/fee_import';

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
 * Two admin actions:
 *   - action='merge' { source_id, target_id }  — manual one-to-one merge
 *   - action='auto-merge'                       — runs autoMergeAliasDuplicates,
 *     cleaning up every known alias-pair in one go (e.g. "Mallareddy" → "MRV")
 */
export const PATCH: RequestHandler = async ({ request, locals }) => {
    checkFeeAccess(locals, 'admin');
    const body = await request.json();
    if (body.action === 'auto-merge') {
        const merges = await autoMergeAliasDuplicates();
        return json({ ok: true, merged: merges.length, details: merges });
    }
    if (body.action === 'merge') {
        if (!body.source_id || !body.target_id) throw error(400, 'source_id and target_id required');
        const result = await mergeUniversities(body.source_id, body.target_id);
        return json({ ok: true, ...result });
    }
    throw error(400, 'action must be "merge" or "auto-merge"');
};
